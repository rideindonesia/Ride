import { pgTable, serial, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 20 }).notNull().default("percent"),
  discountValue: integer("discount_value").notNull(),
  minOrder: integer("min_order").default(0).notNull(),
  maxDiscount: integer("max_discount"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0).notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  description: varchar("description", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Voucher = typeof vouchersTable.$inferSelect;
export type NewVoucher = typeof vouchersTable.$inferInsert;
