import { Router } from "express";
import type { Request } from "express";
import { db, usersTable, loginHistoryTable, merchantsTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import crypto from "crypto";
import { normalizePhone } from "../lib/phone";

const router = Router();

// Catat riwayat login (perangkat + IP) untuk ditampilkan ke pengguna/mitra.
async function recordLogin(req: Request, userId: number, role: string): Promise<void> {
  try {
    const fwd = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim()) || req.ip || null;
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;
    await db.insert(loginHistoryTable).values({ userId, role, ipAddress: ip, userAgent: ua });
  } catch { /* jangan blok login jika pencatatan gagal */ }
}

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { name, email, password, role } = parsed.data;

  // Warung/merchant TIDAK boleh dibuat lewat register generik — wajib lewat
  // POST /api/merchant/apply lalu disetujui admin. Cegah bypass verifikasi.
  if (role === "merchant") {
    res.status(403).json({ error: "Pendaftaran warung harus melalui proses pengajuan & persetujuan admin" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash: hashPassword(password),
    role,
  }).returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role });

  // Store role-specific ID in session
  if (user.role === "pengguna") {
    (req.session as Record<string, unknown>).penggunaId = user.id;
  } else if (user.role === "merchant") {
    (req.session as Record<string, unknown>).merchantId = user.id;
  } else {
    (req.session as Record<string, unknown>).mitraId = user.id;
  }

  res.status(201).json({ user, message: "Pendaftaran berhasil" });
});

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { email: emailOrPhoneRaw, password, role } = parsed.data;
  const emailOrPhone = emailOrPhoneRaw.includes("@") ? emailOrPhoneRaw : normalizePhone(emailOrPhoneRaw);

  // Warung (role 'merchant') kini login lewat form Mitra (berbasis nomor HP).
  // Saat role='mitra', cocokkan juga akun warung agar terarah ke dashboard warung.
  const roleFilter =
    role === "mitra"
      ? inArray(usersTable.role, ["mitra", "merchant"])
      : eq(usersTable.role, role);

  // Ambil semua kandidat yang cocok identifier + peran, lalu pilih yang password-nya
  // cocok. Ini deterministik walau ada mitra & warung yang berbagi nomor HP/email
  // (limit(1) tanpa urutan bisa mengembalikan baris yang salah dan menggagalkan login).
  const candidates = await db.select().from(usersTable).where(
    and(
      or(
        eq(usersTable.email, emailOrPhone),
        eq(usersTable.phone, emailOrPhone),
      ),
      roleFilter,
    )
  ).limit(5);

  const pwHash = hashPassword(password);
  const user = candidates.find((u) => u.passwordHash === pwHash);

  if (!user) {
    res.status(401).json({ error: "Email/No. HP, password, atau peran tidak cocok" });
    return;
  }

  // Warung/merchant hanya boleh login jika sudah disetujui admin (punya baris
  // merchants dengan status 'approved'). Cegah login sebelum verifikasi.
  if (user.role === "merchant") {
    const [merchant] = await db
      .select({ status: merchantsTable.status })
      .from(merchantsTable)
      .where(eq(merchantsTable.ownerUserId, user.id))
      .limit(1);
    if (!merchant || merchant.status !== "approved") {
      res.status(403).json({ error: "Akun warung belum disetujui admin" });
      return;
    }
  }

  // Store role-specific ID — does NOT overwrite the other role's session data
  if (user.role === "pengguna") {
    (req.session as Record<string, unknown>).penggunaId = user.id;
  } else if (user.role === "merchant") {
    (req.session as Record<string, unknown>).merchantId = user.id;
  } else {
    (req.session as Record<string, unknown>).mitraId = user.id;
  }

  await recordLogin(req, user.id, user.role);

  res.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    message: "Berhasil masuk",
  });
});

router.get("/me", async (req, res) => {
  const roleParam = (req.query as any).role as string | undefined;
  const sess = req.session as Record<string, unknown>;

  let userId: number | undefined;

  if (roleParam === "pengguna") {
    userId = sess.penggunaId as number | undefined;
  } else if (roleParam === "mitra") {
    userId = sess.mitraId as number | undefined;
  } else if (roleParam === "merchant") {
    userId = sess.merchantId as number | undefined;
  } else {
    // Legacy: no role param — return whichever is set (prefer pengguna)
    userId = (sess.penggunaId ?? sess.mitraId ?? sess.merchantId) as number | undefined;
  }

  if (!userId) {
    res.status(401).json({ error: "Belum login" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User tidak ditemukan" });
    return;
  }

  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post("/logout", (req, res) => {
  const role = (req.query as any).role as string | undefined;
  const sess = req.session as Record<string, unknown>;

  if (role === "pengguna") {
    // Only clear pengguna session — mitra session stays intact
    delete sess.penggunaId;
    req.session.save(() => {
      res.json({ message: "Berhasil keluar" });
    });
  } else if (role === "mitra") {
    // Only clear mitra session — pengguna session stays intact
    delete sess.mitraId;
    req.session.save(() => {
      res.json({ message: "Berhasil keluar" });
    });
  } else if (role === "merchant") {
    // Only clear merchant session — other role sessions stay intact
    delete sess.merchantId;
    req.session.save(() => {
      res.json({ message: "Berhasil keluar" });
    });
  } else {
    // Clear everything
    req.session.destroy(() => {
      res.json({ message: "Berhasil keluar" });
    });
  }
});

export default router;
