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

  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).userRole = user.role;

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

  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).userRole = user.role;

  const cookieName = user.role === "pengguna" ? "ride-p-uid" : "ride-m-uid";
  const cookieOpts = { httpOnly: true, signed: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: "lax" as const };
  res.cookie(cookieName, String(user.id), cookieOpts);

  res.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    message: "Berhasil masuk",
  });
});

router.get("/me", async (req, res) => {
  const roleParam = (req.query as any).role as string | undefined;
  const pUid = (req as any).signedCookies?.["ride-p-uid"];
  const mUid = (req as any).signedCookies?.["ride-m-uid"];
  const sessionUid = (req.session as Record<string, unknown>).userId as number | undefined;
  const sessionRole = (req.session as Record<string, unknown>).userRole as string | undefined;

  let userId: number | undefined;

  if (roleParam === "pengguna") {
    // Prefer pengguna cookie, fall back to session if session is also pengguna
    if (pUid) {
      userId = parseInt(pUid);
    } else if (sessionUid && sessionRole === "pengguna") {
      userId = sessionUid;
    }
  } else if (roleParam === "mitra") {
    // Prefer mitra cookie, fall back to session if session is also mitra
    if (mUid) {
      userId = parseInt(mUid);
    } else if (sessionUid && sessionRole === "mitra") {
      userId = sessionUid;
    }
  } else {
    // No role specified: session wins (legacy behavior)
    if (sessionUid) {
      userId = sessionUid;
    } else if (pUid) {
      userId = parseInt(pUid);
    } else if (mUid) {
      userId = parseInt(mUid);
    }
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
  const role = (req.session as Record<string, unknown>).userRole as string | undefined;
  req.session.destroy(() => {
    res.clearCookie("ride-p-uid");
    res.clearCookie("ride-m-uid");
    res.json({ message: "Berhasil keluar" });
  });
});

export default router;
