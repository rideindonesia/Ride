import { pgTable, serial, integer, text, doublePrecision, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const merchantsTable = pgTable("merchants", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id"),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 30 }).notNull().default("food"),
  description: text("description"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  photoPath: text("photo_path"),
  isOpen: boolean("is_open").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Merchant = typeof merchantsTable.$inferSelect;
export type NewMerchant = typeof merchantsTable.$inferInsert;
