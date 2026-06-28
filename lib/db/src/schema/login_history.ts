import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const loginHistoryTable = pgTable("login_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoginHistory = typeof loginHistoryTable.$inferSelect;
