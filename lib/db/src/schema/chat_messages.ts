import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  senderRole: varchar("sender_role", { length: 20 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type NewChatMessage = typeof chatMessagesTable.$inferInsert;
