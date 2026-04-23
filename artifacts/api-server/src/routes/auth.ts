import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "+62" + digits.slice(1);
  if (digits.startsWith("62")) return "+" + digits;
  if (digits.startsWith("8")) return "+62" + digits;
  return "+" + digits;
}

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { name, email, password, role } = parsed.data;

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

  const [user] = await db.select().from(usersTable).where(
    and(
      or(
        eq(usersTable.email, emailOrPhone),
        eq(usersTable.phone, emailOrPhone),
      ),
      eq(usersTable.role, role),
    )
  ).limit(1);

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Email/No. HP, password, atau peran tidak cocok" });
    return;
  }

  // Store role-specific ID — does NOT overwrite the other role's session data
  if (user.role === "pengguna") {
    (req.session as Record<string, unknown>).penggunaId = user.id;
  } else {
    (req.session as Record<string, unknown>).mitraId = user.id;
  }

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
  } else {
    // Legacy: no role param — return whichever is set (prefer pengguna)
    userId = (sess.penggunaId ?? sess.mitraId) as number | undefined;
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
  } else {
    // Clear everything
    req.session.destroy(() => {
      res.json({ message: "Berhasil keluar" });
    });
  }
});

export default router;
