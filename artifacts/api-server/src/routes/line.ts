import { Router } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { applyStampBySpotId } from "./stamps";

// ---------------------------------------------------------------------------
// Beacon → Spot mapping
// 12個に増やす場合はこのオブジェクトにエントリを追加するだけでよい。
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
  // 2台目以降の追加例:
  // "00000531ef": {
  //   spotId: 2,
  //   beaconCode: "xxxx-xxxx-xxxx",
  //   name: "お神輿スタンプ 2",
  //   episodeMessage: "...",
  //   riddleMessage: "...",
  // },
};

// ---------------------------------------------------------------------------
// 連続発火対策（メモリMap / サーバー再起動でリセット許容）
// ---------------------------------------------------------------------------
const throttleMap = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// LINE署名検証
// ---------------------------------------------------------------------------
function verifyLineSignature(rawBody: Buffer, signature: string, channelSecret: string): boolean {
  const hmac = crypto.createHmac("SHA256", channelSecret);
  hmac.update(rawBody);
  return hmac.digest("base64") === signature;
}

// ---------------------------------------------------------------------------
// LINE Push Message 送信
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
  // LIFFログイン時に line_uid:${userId} 形式で保存される場合もあるため両方検索する
  const user = await db.query.usersTable.findFirst({
    where: or(
      eq(usersTable.lineUserId, lineUserId),
      eq(usersTable.lineUserId, `line_uid:${lineUserId}`),
    ),
  });

  logger.info(
    {
      lineUserId,
      foundUserId: user?.userId ?? null,
      foundLineUserId: user?.lineUserId ?? null,
    },
    "Beacon: ユーザー検索結果",
  );

  if (!user) {
    logger.warn({ lineUserId }, "Beacon: 未登録ユーザー（usersTableに一致なし）");
    await sendPushMessage(lineUserId, [
      {
        type: "text",
        text:
          "スタンプラリーへの参加には初回登録が必要です。\nまずアプリを開いてLINEログインを完了してください。\nhttps://hanno-stamp-rally.replit.app/",
      },
    ]);
    return;
  }

  // スタンプ付与（共通関数）
  const result = await applyStampBySpotId({
    userId: user.userId,
    spotId: beaconInfo.spotId,
    triggerType: "BEACON",
  });

  // 必須ログ
  logger.info(
    {
      lineUserId,
      internalUserId: user.userId,
      hwid,
      spotId: beaconInfo.spotId,
      resultStatus: result.status,
      applied: result.applied,
    },
    "[Beacon stamp result]",
  );

  // DB検証ログ
  logger.info(
    {
      userId: user.userId,
      spotId: beaconInfo.spotId,
      stampExists: result.stamp !== null,
      stampId: result.stamp?.id ?? null,
      triggerType: result.stamp?.triggerType ?? null,
    },
    "[Beacon stamp verification]",
  );

  if (result.status === "spot_not_found") {
    logger.error({ spotId: beaconInfo.spotId }, "Beacon: spotsTable に spotId が存在しません！シードを確認してください");
    return;
  }

  // LINEメッセージ送信
  const alreadyStamped = result.status === "already_stamped";
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

  // LINEは素早い200レスポンスを要求するため先に返す
  res.status(200).json({ ok: true });

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
