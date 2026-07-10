import { pgTable, serial, text, timestamp, pgEnum, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["pengguna", "mitra", "merchant"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  profilePhotoPath: text("profile_photo_path"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isSuspended: boolean("is_suspended").default(false).notNull(),
  notifPrefs: jsonb("notif_prefs").$type<Record<string, boolean>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
