import { Router } from "express";
import { db, stampsTable, prizeRedemptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { buildPrizeStatus } from "./stamps";
import { RedeemPrizeBody } from "@workspace/api-zod";

const router = Router();

router.get("/prizes/status", requireAuth, async (req, res) => {
  const userId = req.user!.userId;
  const userStamps = await db.query.stampsTable.findMany({
    where: eq(stampsTable.userId, userId),
  });
  const totalObtained = userStamps.length;
  const prizeStatus = await buildPrizeStatus(userId, totalObtained);
  res.json(prizeStatus);
});

router.post("/prizes/redeem", requireAuth, async (req, res) => {
  const parsed = RedeemPrizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid request body" });
    return;
  }

  const { userId, tier } = parsed.data;
  const staffUserId = req.user!.userId;

  const userStamps = await db.query.stampsTable.findMany({
    where: eq(stampsTable.userId, userId),
  });
  const totalObtained = userStamps.length;

  const tierRequirements: Record<string, number> = {
    bronze: 6,
    silver: 11,
    complete: 11,
  };

  const required = tierRequirements[tier];
  if (required === undefined) {
    res.status(400).json({ error: "invalid_tier", message: "Invalid prize tier" });
    return;
  }

  if (totalObtained < required) {
    res.status(400).json({ error: "not_eligible", message: "スタンプ数が不足しています" });
    return;
  }

  const existing = await db.query.prizeRedemptionsTable.findFirst({
    where: and(
      eq(prizeRedemptionsTable.userId, userId),
      eq(prizeRedemptionsTable.tier, tier),
    ),
  });

  if (existing) {
    res.status(400).json({ error: "already_redeemed", message: "この景品はすでに交換済みです" });
    return;
  }

  const [redemption] = await db.insert(prizeRedemptionsTable).values({
    userId,
    tier,
    redeemedBy: staffUserId,
  }).returning();

  res.json({
    success: true,
    tier,
    redeemedAt: redemption.redeemedAt.toISOString(),
  });
});

export default router;
