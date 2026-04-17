import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("general"),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Report = typeof reportsTable.$inferSelect;
export type NewReport = typeof reportsTable.$inferInsert;
