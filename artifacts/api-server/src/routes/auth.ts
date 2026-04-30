import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { LineLoginBody } from "@workspace/api-zod";

const router = Router();

function generateUserId(): string {
  return `user_${crypto.randomBytes(12).toString("hex")}`;
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/auth/line", async (req, res) => {
  const parsed = LineLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid request body" });
    return;
  }

  const { idToken, displayName, pictureUrl } = parsed.data;

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
  } else {
    await db.update(usersTable)
      .set({ sessionToken, displayName: displayName ?? user.displayName, pictureUrl: pictureUrl ?? user.pictureUrl, updatedAt: new Date() })
      .where(eq(usersTable.lineUserId, lineUserId));
    user = { ...user, sessionToken };
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
