import { db, usersTable, mitraApplicationsTable, merchantApplicationsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

/**
 * Normalisasi nomor HP Indonesia ke format E.164 (+62...).
 * Sumber tunggal — dipakai semua alur pendaftaran & login agar konsisten.
 */
export function normalizePhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return "+62" + digits.slice(1);
  if (digits.startsWith("62")) return "+" + digits;
  if (digits.startsWith("8")) return "+62" + digits;
  return "+" + digits;
}

/** Validasi nomor HP Indonesia: +62 diikuti 8–13 digit. */
export function isValidPhone(phone: string): boolean {
  return /^\+62\d{8,13}$/.test(normalizePhone(phone));
}

/**
 * Cek apakah nomor HP sudah dipakai oleh akun aktif (users) ATAU pengajuan
 * yang masih berjalan (mitra/merchant application yang belum ditolak).
 * Menegakkan aturan: 1 nomor HP hanya bisa mendaftarkan 1 akun.
 */
export async function isPhoneRegistered(phone: string): Promise<boolean> {
  const norm = normalizePhone(phone);

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, norm))
    .limit(1);
  if (user) return true;

  const [mitraApp] = await db
    .select({ id: mitraApplicationsTable.id })
    .from(mitraApplicationsTable)
    .where(and(eq(mitraApplicationsTable.phone, norm), ne(mitraApplicationsTable.status, "rejected")))
    .limit(1);
  if (mitraApp) return true;

  const [merchantApp] = await db
    .select({ id: merchantApplicationsTable.id })
    .from(merchantApplicationsTable)
    .where(and(eq(merchantApplicationsTable.phone, norm), ne(merchantApplicationsTable.status, "rejected")))
    .limit(1);
  return !!merchantApp;
}
