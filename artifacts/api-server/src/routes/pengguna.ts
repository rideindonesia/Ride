import { Router } from "express";
import { db, usersTable, otpCodesTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { RegisterPenggunaBody, VerifyOtpPenggunaBody, ResendOtpPenggunaBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/register", async (req, res) => {
  const parsed = RegisterPenggunaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { name, phone, email, password, confirmPassword, agreeTerms } = parsed.data;

  if (!agreeTerms) {
    res.status(400).json({ error: "Anda harus menyetujui syarat dan ketentuan" });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Password dan konfirmasi password tidak cocok" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter" });
    return;
  }

  const existingEmail = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingEmail.length > 0) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const existingPhone = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (existingPhone.length > 0) {
    res.status(409).json({ error: "Nomor HP sudah terdaftar" });
    return;
  }

  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpCodesTable).values({
    phone,
    code: otpCode,
    pendingData: { name, phone, email, passwordHash: hashPassword(password) },
    expiresAt,
    used: false,
  });

  res.json({
    message: "Kode OTP telah dikirim ke nomor HP Anda",
    phone,
    otpCode,
  });
});

router.post("/verify-otp", async (req, res) => {
  const parsed = VerifyOtpPenggunaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { phone, otp } = parsed.data;
  const now = new Date();

  const [otpRecord] = await db.select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.phone, phone),
        eq(otpCodesTable.code, otp),
        eq(otpCodesTable.used, false),
        gt(otpCodesTable.expiresAt, now),
      )
    )
    .orderBy(otpCodesTable.createdAt)
    .limit(1);

  if (!otpRecord) {
    res.status(400).json({ error: "Kode OTP tidak valid atau sudah kadaluarsa" });
    return;
  }

  await db.update(otpCodesTable)
    .set({ used: true })
    .where(eq(otpCodesTable.id, otpRecord.id));

  const pending = otpRecord.pendingData as {
    name: string;
    phone: string;
    email: string;
    passwordHash: string;
  };

  const [user] = await db.insert(usersTable).values({
    name: pending.name,
    email: pending.email,
    phone: pending.phone,
    passwordHash: pending.passwordHash,
    role: "pengguna",
  }).returning({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    phone: usersTable.phone,
    role: usersTable.role,
  });

  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).userRole = user.role;

  res.status(201).json({
    user,
    message: "Pendaftaran berhasil",
  });
});

router.post("/resend-otp", async (req, res) => {
  const parsed = ResendOtpPenggunaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data tidak valid" });
    return;
  }

  const { phone } = parsed.data;

  const [lastOtp] = await db.select()
    .from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.used, false)))
    .orderBy(otpCodesTable.createdAt)
    .limit(1);

  if (!lastOtp || !lastOtp.pendingData) {
    res.status(400).json({ error: "Tidak ada pendaftaran aktif untuk nomor ini" });
    return;
  }

  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(otpCodesTable).values({
    phone,
    code: otpCode,
    pendingData: lastOtp.pendingData,
    expiresAt,
    used: false,
  });

  res.json({
    message: "Kode OTP baru telah dikirim",
    phone,
    otpCode,
  });
});

export default router;
