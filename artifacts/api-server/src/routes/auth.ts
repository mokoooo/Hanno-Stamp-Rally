import { Router } from "express";
import { db, usersTable, stampsTable, prizeRedemptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { LineLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

function generateUserId(): string {
  return `user_${crypto.randomBytes(12).toString("hex")}`;
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// line_uid: プレフィックス付き旧ユーザーのスタンプ・景品を正規ユーザーへ移行
// 外部ブラウザで withLoginOnExternalBrowser なしでログインしていた場合に発生する。
// ---------------------------------------------------------------------------
async function migrateLegacyUser(properUserId: string, lineUserId: string): Promise<void> {
  const legacyLineUserId = `line_uid:${lineUserId}`;
  const legacyUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.lineUserId, legacyLineUserId),
  });

  if (!legacyUser) return;

  logger.info(
    { properUserId, legacyUserId: legacyUser.userId, legacyLineUserId },
    "レガシーユーザーを発見 — スタンプ・景品を移行します",
  );

  // スタンプ移行: 新ユーザーが持っていないスポットのみ
  const [legacyStamps, newUserStamps] = await Promise.all([
    db.query.stampsTable.findMany({ where: eq(stampsTable.userId, legacyUser.userId) }),
    db.query.stampsTable.findMany({ where: eq(stampsTable.userId, properUserId) }),
  ]);

  const newSpotIds = new Set(newUserStamps.map((s) => s.spotId));

  for (const stamp of legacyStamps) {
    if (!newSpotIds.has(stamp.spotId)) {
      try {
        await db.insert(stampsTable).values({
          userId: properUserId,
          spotId: stamp.spotId,
          triggerType: stamp.triggerType as "QR" | "BEACON",
        });
        logger.info(
          { properUserId, spotId: stamp.spotId, triggerType: stamp.triggerType },
          "スタンプ移行完了",
        );
      } catch {
        // unique制約違反は無視
      }
    }
  }

  // 景品受け取り移行
  const legacyPrizes = await db.query.prizeRedemptionsTable.findMany({
    where: eq(prizeRedemptionsTable.userId, legacyUser.userId),
  });

  for (const prize of legacyPrizes) {
    try {
      await db.insert(prizeRedemptionsTable).values({
        userId: properUserId,
        tier: prize.tier,
        redeemedBy: prize.redeemedBy ?? undefined,
      });
      logger.info({ properUserId, tier: prize.tier }, "景品受け取り移行完了");
    } catch {
      // unique制約違反は無視
    }
  }

  // レガシーユーザーのデータを削除
  await db.delete(stampsTable).where(eq(stampsTable.userId, legacyUser.userId));
  await db.delete(prizeRedemptionsTable).where(eq(prizeRedemptionsTable.userId, legacyUser.userId));
  await db.delete(usersTable).where(eq(usersTable.userId, legacyUser.userId));

  logger.info({ legacyUserId: legacyUser.userId }, "レガシーユーザー削除完了");
}

// ---------------------------------------------------------------------------
// POST /auth/line  — LINE LIFF ID トークンでログイン
// ---------------------------------------------------------------------------
router.post("/auth/line", async (req, res) => {
  const parsed = LineLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid request body" });
    return;
  }

  const { idToken, displayName, pictureUrl } = parsed.data;

  // lineUserId を確定する
  // JWTの場合 → sub フィールドが LINE userId ("Uxxxxxxxx")
  // フォールバック文字列の場合 → そのまま使う
  let lineUserId: string;
  try {
    const parts = idToken.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      lineUserId = payload.sub;
      if (!lineUserId) throw new Error("No sub in token");
    } else {
      lineUserId = idToken;
    }
  } catch {
    lineUserId = idToken;
  }

  logger.info({ lineUserId: lineUserId.startsWith("line_uid:") ? lineUserId : `${lineUserId.slice(0, 6)}***` }, "ログイン試行");

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.lineUserId, lineUserId),
  });

  const sessionToken = generateSessionToken();

  if (!user) {
    const userId = generateUserId();
    const [created] = await db.insert(usersTable).values({
      userId,
      lineUserId,
      displayName: displayName ?? "ゲスト",
      pictureUrl: pictureUrl ?? null,
      sessionToken,
    }).returning();
    user = created;
    logger.info({ userId, lineUserId: lineUserId.slice(0, 6) + "***" }, "新規ユーザー作成");
  } else {
    await db.update(usersTable)
      .set({
        sessionToken,
        displayName: displayName ?? user.displayName,
        pictureUrl: pictureUrl ?? user.pictureUrl,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.lineUserId, lineUserId));
    user = { ...user, sessionToken };
  }

  // 正規LINEユーザー (Uxxxxxxxx) でログインした場合、
  // 旧 line_uid: プレフィックス付きユーザーのデータを移行する
  if (!lineUserId.startsWith("line_uid:")) {
    try {
      await migrateLegacyUser(user.userId, lineUserId);
    } catch (err) {
      logger.error({ err }, "レガシーユーザー移行中にエラー（ログインは継続）");
    }
  }

  res.cookie("session_token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    userId: user.userId,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl ?? undefined,
    sessionToken,
  });
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------
router.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = req.cookies?.session_token ?? bearerToken;
  if (!token) {
    res.status(401).json({ error: "unauthenticated", message: "Not logged in" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.sessionToken, token),
  });

  if (!user) {
    res.status(401).json({ error: "unauthenticated", message: "Invalid session" });
    return;
  }

  res.json({
    userId: user.userId,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl ?? undefined,
    isAdmin: user.isAdmin,
  });
});

export default router;
