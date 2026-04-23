import { pgTable, serial, integer, text, json, doublePrecision, real, timestamp, varchar, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNo: varchar("order_no", { length: 20 }).notNull().unique(),
  penggunaId: integer("pengguna_id").notNull().references(() => usersTable.id),
  mitraId: integer("mitra_id").references(() => usersTable.id),
  serviceType: varchar("service_type", { length: 50 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 20 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: varchar("vehicle_year", { length: 4 }),
  damageCategories: json("damage_categories").$type<string[]>(),
  description: text("description"),
  pickupAddress: text("pickup_address"),
  detailAlamat: text("detail_alamat"),
  pickupLat: doublePrecision("pickup_lat"),
  pickupLng: doublePrecision("pickup_lng"),
  destLat: doublePrecision("dest_lat"),
  destLng: doublePrecision("dest_lng"),
  destAddress: text("dest_address"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  penggunaConfirmed: boolean("pengguna_confirmed").default(false).notNull(),
  trackingPhase: varchar("tracking_phase", { length: 20 }).default("menuju"),
  paymentData: json("payment_data").$type<{ biayaJasa: number; biayaSparepart: number; biayaPanggilan: number; biayaLayanan: number; total: number; paymentMethod: string } | null>(),
  totalAmount: integer("total_amount"),
  platformFee: integer("platform_fee"),
  rating: real("rating"),
  reviewComment: text("review_comment"),
  isPlatformFeePaid: boolean("is_platform_fee_paid").default(false).notNull(),
  platformFeePaidAt: timestamp("platform_fee_paid_at"),
  cancelReason: text("cancel_reason"),
  canceledBy: varchar("canceled_by", { length: 20 }),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  penggunaPhotoPath: text("pengguna_photo_path"),
  mitraProofPhotoPath: text("mitra_proof_photo_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;
