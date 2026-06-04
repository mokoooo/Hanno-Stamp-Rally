import { Router } from "express";
import { db, spotsTable, stampsTable, prizeRedemptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { ApplyStampBody } from "@workspace/api-zod";

const router = Router();

const PRIZE_TIERS = [
  { tier: "bronze", requiredStamps: 6, label: "6スタンプ達成賞" },
  { tier: "silver", requiredStamps: 11, label: "11スタンプ達成賞" },
  { tier: "complete", requiredStamps: 11, label: "コンプリート賞" },
];

async function buildPrizeStatus(userId: string, totalObtained: number) {
  const redemptions = await db.query.prizeRedemptionsTable.findMany({
    where: eq(prizeRedemptionsTable.userId, userId),
  });

  const prizes = PRIZE_TIERS.map((tier) => {
    const redemption = redemptions.find((r) => r.tier === tier.tier);
    return {
      tier: tier.tier as "bronze" | "silver" | "complete",
      requiredStamps: tier.requiredStamps,
      label: tier.label,
      eligible: tier.tier === "complete"
        ? totalObtained >= 11
        : totalObtained >= tier.requiredStamps,
      redeemed: !!redemption,
      redeemedAt: redemption?.redeemedAt?.toISOString() ?? null,
    };
  });

  return { prizes, totalObtained };
}

// ---------------------------------------------------------------------------
// 共通スタンプ付与関数（QR・Beacon 両方から呼ばれる）
// ---------------------------------------------------------------------------
export async function applyStampBySpotId(params: {
  userId: string;
  spotId: number;
  triggerType: "QR" | "BEACON";
}) {
  const { userId, spotId, triggerType } = params;

  const spot = await db.query.spotsTable.findFirst({
    where: eq(spotsTable.id, spotId),
  });

  if (!spot) {
    return { status: "spot_not_found" as const, applied: false, spot: null, stamp: null };
  }

  const existing = await db.query.stampsTable.findFirst({
    where: and(
      eq(stampsTable.userId, userId),
      eq(stampsTable.spotId, spotId),
    ),
  });

  if (existing) {
    return { status: "already_stamped" as const, applied: false, spot, stamp: existing };
  }

  try {
    const [created] = await db
      .insert(stampsTable)
      .values({ userId, spotId, triggerType })
      .returning();
    return { status: "applied" as const, applied: true, spot, stamp: created };
  } catch (err: any) {
    // unique制約違反（競合）
    if (err?.code === "23505") {
      const existing2 = await db.query.stampsTable.findFirst({
        where: and(eq(stampsTable.userId, userId), eq(stampsTable.spotId, spotId)),
      });
      return { status: "already_stamped" as const, applied: false, spot, stamp: existing2 ?? null };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// GET /stamps/card
// ---------------------------------------------------------------------------
router.get("/stamps/card", requireAuth, async (req, res) => {
  const userId = req.user!.userId;

  const spots = await db.query.spotsTable.findMany({
    orderBy: (s, { asc }) => [asc(s.order)],
  });

  const userStamps = await db.query.stampsTable.findMany({
    where: eq(stampsTable.userId, userId),
  });

  const stampMap = new Map(userStamps.map((s) => [s.spotId, s]));
  const totalObtained = userStamps.length;

  const stamps = spots.map((spot) => {
    const obtained = stampMap.get(spot.id);
    return {
      id: spot.id,
      name: spot.name,
      description: spot.description,
      location: spot.location,
      order: spot.order,
      obtained: !!obtained,
      obtainedAt: obtained?.obtainedAt?.toISOString() ?? null,
    };
  });

  const prizeStatus = await buildPrizeStatus(userId, totalObtained);

  res.json({
    userId,
    displayName: req.user!.displayName,
    pictureUrl: req.user!.pictureUrl ?? undefined,
    stamps,
    totalObtained,
    totalSpots: spots.length,
    prizeStatus,
  });
});

// ---------------------------------------------------------------------------
// POST /stamps/apply  (QRコードスキャン)
// ---------------------------------------------------------------------------
router.post("/stamps/apply", requireAuth, async (req, res) => {
  const parsed = ApplyStampBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid request body" });
    return;
  }

  const { token, triggerType } = parsed.data;
  const userId = req.user!.userId;

  const spot = await db.query.spotsTable.findFirst({
    where: eq(spotsTable.token, token),
  });

  if (!spot) {
    res.status(404).json({ error: "not_found", message: "スタンプスポットが見つかりません" });
    return;
  }

  const result = await applyStampBySpotId({ userId, spotId: spot.id, triggerType });

  if (result.status === "already_stamped") {
    res.status(400).json({ error: "already_stamped", message: "このスタンプはすでに取得済みです" });
    return;
  }

  if (result.status === "spot_not_found") {
    res.status(404).json({ error: "not_found", message: "スタンプスポットが見つかりません" });
    return;
  }

  const totalObtained = (await db.query.stampsTable.findMany({
    where: eq(stampsTable.userId, userId),
  })).length;

  let prizeUnlocked: string | null = null;
  if (totalObtained === 6) prizeUnlocked = "bronze";
  else if (totalObtained === 11) prizeUnlocked = "silver";

  res.json({
    success: true,
    stamp: {
      id: spot.id,
      name: spot.name,
      description: spot.description,
      location: spot.location,
      order: spot.order,
      obtained: true,
      obtainedAt: new Date().toISOString(),
    },
    totalObtained,
    message: `${spot.name}のスタンプを獲得しました！`,
    prizeUnlocked,
  });
});

export { buildPrizeStatus };
export default router;
