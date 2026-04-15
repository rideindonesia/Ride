import { pgTable, serial, integer, text, json, doublePrecision, real, timestamp, varchar } from "drizzle-orm/pg-core";
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
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  totalAmount: integer("total_amount"),
  platformFee: integer("platform_fee"),
  rating: real("rating"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
export type NewOrder = typeof ordersTable.$inferInsert;
