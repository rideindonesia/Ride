import { pgTable, serial, text, integer, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";

export const userAddressesTable = pgTable("user_addresses", {
  id: serial("id").primaryKey(),
  penggunaId: integer("pengguna_id").notNull(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserAddress = typeof userAddressesTable.$inferSelect;
