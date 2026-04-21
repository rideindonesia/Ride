import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const platformFeePaymentsTable = pgTable("platform_fee_payments", {
  id: serial("id").primaryKey(),
  mitraId: integer("mitra_id").notNull().references(() => usersTable.id),
  amountClaimed: integer("amount_claimed").notNull(),
  amountVerified: integer("amount_verified"),
  proofPhotoPath: text("proof_photo_path").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
  verifiedById: integer("verified_by_id"),
});

export type PlatformFeePayment = typeof platformFeePaymentsTable.$inferSelect;
export type NewPlatformFeePayment = typeof platformFeePaymentsTable.$inferInsert;
