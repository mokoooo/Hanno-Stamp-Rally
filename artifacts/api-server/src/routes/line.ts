import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, stampsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Beacon → Spot mapping
// 将来12個に増やす場合は、このオブジェクトにエントリを追加するだけでよい。
// 将来DB管理に移行する場合は、同じ構造のレコードをbeacon_configsテーブルに格納し
// 起動時にロードする形に変更できる。
// ---------------------------------------------------------------------------
const BEACON_STAMP_MAP: Record<string, {
  spotId: number;
  beaconCode: string;
  name: string;
  episodeMessage: string;
  riddleMessage: string;
}> = {
  "00000531ee": {
    spotId: 1,
    beaconCode: "2e78-7b58-5e1f",
    name: "お神輿スタンプ 1",
    episodeMessage:
      "【お神輿エピソード】このお神輿は飯能まつりの巡行を彩る大切な存在です。地域の人々が受け継いできた伝統を、ぜひ近くで感じてください。",
    riddleMessage:
      "【お神輿なぞなぞ】担がれると進むのに、自分では歩かないものはなに？\n答えは…お神輿！",
  },
  // 例: 2台目以降を追加する場合
  // "00000531ef": {
  //   spotId: 2,
  //   beaconCode: "xxxx-xxxx-xxxx",
  //   name: "お神輿スタンプ 2",
  //   episodeMessage: "...",
  //   riddleMessage: "...",
  // },
};

// ---------------------------------------------------------------------------
// 連続発火対策: メモリMap（サーバー再起動でリセット、許容）
// key: `${lineUserId}:${hwid}` / value: 最終処理時刻(ms)
// ---------------------------------------------------------------------------
const throttleMap = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000; // 5分

// ---------------------------------------------------------------------------
// LINE署名検証
// ---------------------------------------------------------------------------
function verifyLineSignature(rawBody: Buffer, signature: string, channelSecret: string): boolean {
  const hmac = crypto.createHmac("SHA256", channelSecret);
  hmac.update(rawBody);
  return hmac.digest("base64") === signature;
}

// ---------------------------------------------------------------------------
// LINE Push Message送信
// ---------------------------------------------------------------------------
async function sendPushMessage(
  lineUserId: string,
  messages: Array<{ type: "text"; text: string }>,
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logger.warn("LINE_CHANNEL_ACCESS_TOKEN が未設定のためプッシュメッセージをスキップします");
    return;
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "LINE push message送信失敗");
  } else {
    logger.info({ lineUserId, messageCount: messages.length }, "LINE push message送信成功");
  }
}

// ---------------------------------------------------------------------------
// Beaconイベント処理（1件）
// ---------------------------------------------------------------------------
async function processBeaconEvent(event: any): Promise<void> {
  const hwid = event.beacon?.hwid as string | undefined;
  const lineUserId = event.source?.userId as string | undefined;

  logger.info(
    { eventType: event.type, hwid, beaconType: event.beacon?.type, lineUserId },
    "Beaconイベント受信",
  );

  if (!hwid || !lineUserId) {
    logger.warn({ hwid, lineUserId }, "hwid または lineUserId が取得できません");
    return;
  }

  const beaconInfo = BEACON_STAMP_MAP[hwid];
  if (!beaconInfo) {
    logger.info({ hwid }, "BEACON_STAMP_MAP に未登録のHWID");
    return;
  }

  // 連続発火チェック
  const throttleKey = `${lineUserId}:${hwid}`;
  const lastProcessed = throttleMap.get(throttleKey);
  const now = Date.now();
  if (lastProcessed !== undefined && now - lastProcessed < THROTTLE_MS) {
    const remainingSec = Math.ceil((THROTTLE_MS - (now - lastProcessed)) / 1000);
    logger.info({ lineUserId, hwid, remainingSec }, "Beacon throttled (5分以内の再発火)");
    return;
  }
  throttleMap.set(throttleKey, now);

  // ユーザー検索
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.lineUserId, lineUserId),
  });

  if (!user) {
    logger.info({ lineUserId }, "Beacon: 未登録ユーザー");
    await sendPushMessage(lineUserId, [
      {
        type: "text",
        text:
          "スタンプラリーへの参加には初回登録が必要です。\nまずアプリを開いてLINEログインを完了してください。\nhttps://hanno-stamp-rally.replit.app/",
      },
    ]);
    return;
  }

  // 取得済みチェック
  const existing = await db.query.stampsTable.findFirst({
    where: and(
      eq(stampsTable.userId, user.userId),
      eq(stampsTable.spotId, beaconInfo.spotId),
    ),
  });

  let alreadyStamped = !!existing;

  if (!alreadyStamped) {
    try {
      await db.insert(stampsTable).values({
        userId: user.userId,
        spotId: beaconInfo.spotId,
        triggerType: "BEACON",
      });
      logger.info(
        { lineUserId, userId: user.userId, spotId: beaconInfo.spotId, result: "新規付与" },
        "Beacon: スタンプ付与",
      );
    } catch (err: any) {
      if (err?.code === "23505") {
        // ユニーク制約違反 = 競合で既に付与済み
        alreadyStamped = true;
        logger.info({ lineUserId, spotId: beaconInfo.spotId, result: "取得済み(競合)" }, "Beacon: スタンプ重複");
      } else {
        logger.error({ err: { message: err?.message, code: err?.code } }, "Beacon: DB挿入エラー");
        return;
      }
    }
  } else {
    logger.info(
      { lineUserId, userId: user.userId, spotId: beaconInfo.spotId, result: "取得済み" },
      "Beacon: スタンプ取得済み",
    );
  }

  // LINEメッセージ送信
  const statusText = alreadyStamped
    ? `このお神輿のスタンプ（${beaconInfo.name}）は取得済みです。`
    : `✅ スタンプを獲得しました！\n${beaconInfo.name}をゲットしました！`;

  await sendPushMessage(lineUserId, [
    { type: "text", text: statusText },
    { type: "text", text: beaconInfo.episodeMessage },
    { type: "text", text: beaconInfo.riddleMessage },
  ]);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router = Router();

router.post("/line/webhook", async (req, res) => {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    logger.error("LINE_CHANNEL_SECRET が未設定です");
    res.status(500).json({ error: "server_config_error" });
    return;
  }

  // 署名検証
  const signature = req.headers["x-line-signature"] as string | undefined;
  if (!signature) {
    logger.warn("x-line-signature ヘッダーが存在しません");
    res.status(401).json({ error: "missing_signature" });
    return;
  }

  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!rawBody) {
    logger.error("rawBody が取得できません。app.ts の express.json({ verify }) 設定を確認してください");
    res.status(400).json({ error: "missing_raw_body" });
    return;
  }

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    logger.warn("LINE署名検証失敗");
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  // LINEは素早い200レスポンスを期待するため、先に返す
  res.status(200).json({ ok: true });

  // 非同期でイベント処理
  const events: any[] = req.body?.events ?? [];
  for (const event of events) {
    if (event.type !== "beacon") continue;
    try {
      await processBeaconEvent(event);
    } catch (err) {
      logger.error({ err }, "Beacon イベント処理中に予期しないエラー");
    }
  }
});

export default router;
