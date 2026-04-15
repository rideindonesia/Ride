import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

const DEMO_PENGGUNA = [
  { name: "Demo Pengguna", phone: "+6281355446677", email: "demo.pengguna@ride.app", password: "demo1234", role: "pengguna" as const },
];

const DEMO_MITRA = [
  { name: "Budi Santoso", phone: "+6281234567890", email: "budi.santoso@ride.app", password: "mitra1234", role: "mitra" as const, service: "bengkel" },
  { name: "Rudi Hermawan", phone: "+6282198765432", email: "rudi.hermawan@ride.app", password: "mitra1234", role: "mitra" as const, service: "etowing" },
  { name: "Doni Prasetyo", phone: "+6283188889999", email: "doni.prasetyo@ride.app", password: "mitra1234", role: "mitra" as const, service: "elektronik" },
  { name: "Anto Wijaya", phone: "+6285211223344", email: "anto.wijaya@ride.app", password: "mitra1234", role: "mitra" as const, service: "pangkas" },
  { name: "Wahyu Sanjaya", phone: "+6287812345678", email: "wahyu.sanjaya@ride.app", password: "mitra1234", role: "mitra" as const, service: "cuci_kendaraan" },
  { name: "Heru Gunawan", phone: "+6289934567890", email: "heru.gunawan@ride.app", password: "mitra1234", role: "mitra" as const, service: "inspeksi" },
];

router.post("/demo", async (_req, res) => {
  const all = [...DEMO_PENGGUNA, ...DEMO_MITRA];
  const results: { phone: string; status: string }[] = [];

  for (const u of all) {
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, u.phone))
      .limit(1);

    if (existing.length > 0) {
      results.push({ phone: u.phone, status: "sudah ada" });
      continue;
    }

    await db.insert(usersTable).values({
      name: u.name,
      email: u.email,
      phone: u.phone,
      passwordHash: hashPassword(u.password),
      role: u.role,
    });
    results.push({ phone: u.phone, status: "dibuat" });
  }

  res.json({ message: "Seeding selesai", results });
});

export default router;
