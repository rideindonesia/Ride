import { pgTable, serial, integer, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const menuItemsTable = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  price: integer("price").notNull().default(0),
  photoPath: text("photo_path"),
  category: varchar("category", { length: 60 }),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MenuItem = typeof menuItemsTable.$inferSelect;
export type NewMenuItem = typeof menuItemsTable.$inferInsert;
