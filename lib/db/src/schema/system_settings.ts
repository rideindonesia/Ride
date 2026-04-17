import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const systemSettingsTable = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  label: text("label"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
