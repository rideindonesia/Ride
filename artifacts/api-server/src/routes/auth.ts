import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

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

  const { email, password, role } = parsed.data;

  const [user] = await db.select().from(usersTable).where(
    and(eq(usersTable.email, email), eq(usersTable.role, role))
  ).limit(1);

  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Email, password, atau peran tidak cocok" });
    return;
  }

  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).userRole = user.role;

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    message: "Berhasil masuk",
  });
});

router.get("/me", async (req, res) => {
  const userId = (req.session as Record<string, unknown>).userId as number | undefined;
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
  req.session.destroy(() => {
    res.json({ message: "Berhasil keluar" });
  });
});

export default router;
