import { Router } from "express";
import { db, spotsTable, usersTable, stampsTable, prizeRedemptionsTable } from "@workspace/db";
import { eq, desc, asc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { RotateSpotTokenParams } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

router.get("/admin/spots", requireAuth, async (req, res) => {
  const spots = await db.query.spotsTable.findMany({
    orderBy: (s, { asc }) => [asc(s.order)],
  });

  const stampCounts = await db
    .select({ spotId: stampsTable.spotId, count: count() })
    .from(stampsTable)
    .groupBy(stampsTable.spotId);

  const countMap = new Map(stampCounts.map((s) => [s.spotId, s.count]));

  res.json({
    spots: spots.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      location: s.location,
      order: s.order,
      token: s.token,
      tokenExpiresAt: s.tokenExpiresAt?.toISOString() ?? null,
      stampCount: countMap.get(s.id) ?? 0,
    })),
  });
});

router.post("/admin/spots/:spotId/token", requireAuth, async (req, res) => {
  const parsed = RotateSpotTokenParams.safeParse({ spotId: req.params.spotId });
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid spot ID" });
    return;
  }

  const { spotId } = parsed.data;
  const token = generateToken();

  const [updated] = await db.update(spotsTable)
    .set({ token, updatedAt: new Date() })
    .where(eq(spotsTable.id, spotId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Spot not found" });
    return;
  }

  const baseUrl = process.env.REPLIT_DOMAINS?.split(",")[0]
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "http://localhost";

  res.json({
    spotId: updated.id,
    token,
    qrUrl: `${baseUrl}/?stamp=${token}`,
  });
});

router.get("/admin/users", requireAuth, async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const offset = (page - 1) * limit;

  const users = await db.query.usersTable.findMany({
    orderBy: (u, { desc }) => [desc(u.createdAt)],
    limit,
    offset,
  });

  const totalResult = await db.select({ count: count() }).from(usersTable);
  const total = totalResult[0]?.count ?? 0;

  const allStamps = await db.query.stampsTable.findMany();
  const allRedemptions = await db.query.prizeRedemptionsTable.findMany();

  const stampCounts = new Map<string, number>();
  const firstStamp = new Map<string, Date>();
  const lastStamp = new Map<string, Date>();

  for (const stamp of allStamps) {
    stampCounts.set(stamp.userId, (stampCounts.get(stamp.userId) ?? 0) + 1);
    const cur = firstStamp.get(stamp.userId);
    if (!cur || stamp.obtainedAt < cur) firstStamp.set(stamp.userId, stamp.obtainedAt);
    const curLast = lastStamp.get(stamp.userId);
    if (!curLast || stamp.obtainedAt > curLast) lastStamp.set(stamp.userId, stamp.obtainedAt);
  }

  const redemptionMap = new Map<string, Set<string>>();
  for (const r of allRedemptions) {
    if (!redemptionMap.has(r.userId)) redemptionMap.set(r.userId, new Set());
    redemptionMap.get(r.userId)!.add(r.tier);
  }

  res.json({
    users: users.map((u) => {
      const tiers = redemptionMap.get(u.userId) ?? new Set();
      return {
        userId: u.userId,
        lineUserId: u.lineUserId,
        displayName: u.displayName,
        pictureUrl: u.pictureUrl ?? undefined,
        totalObtained: stampCounts.get(u.userId) ?? 0,
        bronzeRedeemed: tiers.has("bronze"),
        silverRedeemed: tiers.has("silver"),
        completeRedeemed: tiers.has("complete"),
        firstStampAt: firstStamp.get(u.userId)?.toISOString() ?? null,
        lastStampAt: lastStamp.get(u.userId)?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      };
    }),
    total,
    page,
    limit,
  });
});

router.get("/admin/users/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.userId, userId),
  });

  if (!user) {
    res.status(404).json({ error: "not_found", message: "User not found" });
    return;
  }

  const userStamps = await db.query.stampsTable.findMany({
    where: eq(stampsTable.userId, userId),
  });

  const spots = await db.query.spotsTable.findMany({
    orderBy: (s, { asc }) => [asc(s.order)],
  });

  const redemptions = await db.query.prizeRedemptionsTable.findMany({
    where: eq(prizeRedemptionsTable.userId, userId),
  });

  const stampMap = new Map(userStamps.map((s) => [s.spotId, s]));
  const tiers = new Set(redemptions.map((r) => r.tier));
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

  res.json({
    user: {
      userId: user.userId,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl ?? undefined,
      totalObtained,
      bronzeRedeemed: tiers.has("bronze"),
      silverRedeemed: tiers.has("silver"),
      completeRedeemed: tiers.has("complete"),
      firstStampAt: userStamps.reduce<Date | null>((min, s) => !min || s.obtainedAt < min ? s.obtainedAt : min, null)?.toISOString() ?? null,
      lastStampAt: userStamps.reduce<Date | null>((max, s) => !max || s.obtainedAt > max ? s.obtainedAt : max, null)?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
    stamps,
  });
});

router.get("/admin/export/csv", requireAuth, async (req, res) => {
  const users = await db.query.usersTable.findMany();
  const stamps = await db.query.stampsTable.findMany();
  const spots = await db.query.spotsTable.findMany({ orderBy: (s, { asc }) => [asc(s.order)] });
  const redemptions = await db.query.prizeRedemptionsTable.findMany();

  const stampMap = new Map<string, Map<number, string>>();
  for (const stamp of stamps) {
    if (!stampMap.has(stamp.userId)) stampMap.set(stamp.userId, new Map());
    stampMap.get(stamp.userId)!.set(stamp.spotId, stamp.obtainedAt.toISOString());
  }

  const redemptionMap = new Map<string, Set<string>>();
  for (const r of redemptions) {
    if (!redemptionMap.has(r.userId)) redemptionMap.set(r.userId, new Set());
    redemptionMap.get(r.userId)!.add(r.tier);
  }

  const spotHeaders = spots.map((s) => `spot_${s.order}_${s.name}`);
  const headers = ["user_id", "display_name", "total_stamps", "bronze_redeemed", "silver_redeemed", "complete_redeemed", "registered_at", ...spotHeaders];

  const rows = users.map((u) => {
    const userStamps = stampMap.get(u.userId) ?? new Map();
    const tiers = redemptionMap.get(u.userId) ?? new Set();
    const spotCols = spots.map((s) => userStamps.get(s.id) ? "1" : "0");
    return [
      u.userId,
      u.displayName,
      String(userStamps.size),
      tiers.has("bronze") ? "1" : "0",
      tiers.has("silver") ? "1" : "0",
      tiers.has("complete") ? "1" : "0",
      u.createdAt.toISOString(),
      ...spotCols,
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="stamp_rally_export_${Date.now()}.csv"`);
  res.send("\uFEFF" + csv);
});

router.get("/admin/stats", requireAuth, async (req, res) => {
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [totalStampsResult] = await db.select({ count: count() }).from(stampsTable);

  const redemptionCounts = await db
    .select({ tier: prizeRedemptionsTable.tier, count: count() })
    .from(prizeRedemptionsTable)
    .groupBy(prizeRedemptionsTable.tier);

  const tierCount = new Map(redemptionCounts.map((r) => [r.tier, r.count]));

  const stampsBySpot = await db
    .select({ spotId: stampsTable.spotId, count: count() })
    .from(stampsTable)
    .groupBy(stampsTable.spotId);

  const spots = await db.query.spotsTable.findMany({ orderBy: (s, { asc }) => [asc(s.order)] });
  const spotNameMap = new Map(spots.map((s) => [s.id, s.name]));

  const usersByStampCountRaw = await db
    .select({ userId: stampsTable.userId, cnt: count() })
    .from(stampsTable)
    .groupBy(stampsTable.userId);

  const usersByStampCount = new Map<number, number>();
  for (const row of usersByStampCountRaw) {
    const c = Number(row.cnt);
    usersByStampCount.set(c, (usersByStampCount.get(c) ?? 0) + 1);
  }

  res.json({
    totalUsers: totalUsersResult?.count ?? 0,
    totalStampsIssued: totalStampsResult?.count ?? 0,
    bronzeRedemptions: tierCount.get("bronze") ?? 0,
    silverRedemptions: tierCount.get("silver") ?? 0,
    completeRedemptions: tierCount.get("complete") ?? 0,
    stampsBySpot: stampsBySpot.map((s) => ({
      spotId: s.spotId,
      spotName: spotNameMap.get(s.spotId) ?? "Unknown",
      count: s.count,
    })),
    usersByStampCount: Array.from(usersByStampCount.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([stampCount, userCount]) => ({ stampCount, userCount })),
  });
});

export default router;
