import { pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const spotsTable = pgTable("spots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  order: integer("order").notNull(),
  token: text("token").notNull().unique(),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSpotSchema = createInsertSchema(spotsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type Spot = typeof spotsTable.$inferSelect;
