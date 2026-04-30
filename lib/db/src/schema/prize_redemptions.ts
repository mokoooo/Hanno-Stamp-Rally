import { pgTable, text, timestamp, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const prizeRedemptionsTable = pgTable("prize_redemptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId),
  tier: text("tier").notNull(), // bronze | silver | complete
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
  redeemedBy: text("redeemed_by"), // staff user ID
}, (t) => ({
  uniqueUserTier: unique().on(t.userId, t.tier),
}));

export const insertPrizeRedemptionSchema = createInsertSchema(prizeRedemptionsTable).omit({ id: true, redeemedAt: true });
export type InsertPrizeRedemption = z.infer<typeof insertPrizeRedemptionSchema>;
export type PrizeRedemption = typeof prizeRedemptionsTable.$inferSelect;
