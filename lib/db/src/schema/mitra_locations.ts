import { pgTable, serial, integer, doublePrecision, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const mitraLocationsTable = pgTable("mitra_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  serviceType: text("service_type"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MitraLocation = typeof mitraLocationsTable.$inferSelect;
