import { pgTable, serial, text, timestamp, pgEnum, doublePrecision } from "drizzle-orm/pg-core";

export const merchantStatusEnum = pgEnum("merchant_status", ["pending", "approved", "rejected"]);

export const merchantApplicationsTable = pgTable("merchant_applications", {
  id: serial("id").primaryKey(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  shopName: text("shop_name").notNull(),
  category: text("category").notNull().default("food"),
  description: text("description"),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  operatingCity: text("operating_city").notNull(),
  ktpPath: text("ktp_path"),
  shopPhotoPath: text("shop_photo_path"),
  status: merchantStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MerchantApplication = typeof merchantApplicationsTable.$inferSelect;
export type NewMerchantApplication = typeof merchantApplicationsTable.$inferInsert;
