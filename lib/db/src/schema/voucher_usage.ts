import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const voucherUsageTable = pgTable("voucher_usage", {
  id: serial("id").primaryKey(),
  penggunaId: integer("pengguna_id").notNull(),
  voucherId: integer("voucher_id"),
  code: text("code").notNull(),
  orderId: integer("order_id"),
  orderNo: text("order_no"),
  discount: integer("discount").notNull().default(0),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export type VoucherUsage = typeof voucherUsageTable.$inferSelect;
