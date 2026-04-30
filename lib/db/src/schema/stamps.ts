import { pgTable, text, integer, timestamp, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { spotsTable } from "./spots";

export const stampsTable = pgTable("stamps", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.userId),
  spotId: integer("spot_id").notNull().references(() => spotsTable.id),
  triggerType: text("trigger_type").notNull().default("QR"),
  obtainedAt: timestamp("obtained_at").notNull().defaultNow(),
}, (t) => ({
  uniqueUserSpot: unique().on(t.userId, t.spotId),
}));

export const insertStampSchema = createInsertSchema(stampsTable).omit({ id: true, obtainedAt: true });
export type InsertStamp = z.infer<typeof insertStampSchema>;
export type Stamp = typeof stampsTable.$inferSelect;
