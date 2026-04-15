import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const mitraStatusEnum = pgEnum("mitra_status", ["pending", "approved", "rejected"]);

export const mitraApplicationsTable = pgTable("mitra_applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  serviceType: text("service_type").notNull(),
  ktpPath: text("ktp_path"),
  selfieKtpPath: text("selfie_ktp_path"),
  simPath: text("sim_path"),
  certPath: text("cert_path"),
  operatingCity: text("operating_city").notNull(),
  status: mitraStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MitraApplication = typeof mitraApplicationsTable.$inferSelect;
