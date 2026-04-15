import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, mitraApplicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const uploadDir = path.resolve(process.cwd(), "uploads", "mitra");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format file tidak didukung"));
  },
});

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

const uploadFields = upload.fields([
  { name: "ktp", maxCount: 1 },
  { name: "selfieKtp", maxCount: 1 },
  { name: "sim", maxCount: 1 },
  { name: "cert", maxCount: 1 },
]);

router.post("/apply", uploadFields, async (req, res) => {
  const { name, phone, email, password, serviceType, operatingCity } = req.body;

  if (!name || !phone || !email || !password || !serviceType || !operatingCity) {
    res.status(400).json({ error: "Semua field wajib diisi" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter" });
    return;
  }

  const existing = await db.select({ id: mitraApplicationsTable.id })
    .from(mitraApplicationsTable)
    .where(eq(mitraApplicationsTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const files = req.files as Record<string, Express.Multer.File[]>;

  const [application] = await db.insert(mitraApplicationsTable).values({
    name,
    phone,
    email,
    passwordHash: hashPassword(password),
    serviceType,
    ktpPath: files?.ktp?.[0]?.filename ?? null,
    selfieKtpPath: files?.selfieKtp?.[0]?.filename ?? null,
    simPath: files?.sim?.[0]?.filename ?? null,
    certPath: files?.cert?.[0]?.filename ?? null,
    operatingCity,
    status: "pending",
  }).returning({
    id: mitraApplicationsTable.id,
    name: mitraApplicationsTable.name,
    email: mitraApplicationsTable.email,
    serviceType: mitraApplicationsTable.serviceType,
    operatingCity: mitraApplicationsTable.operatingCity,
    status: mitraApplicationsTable.status,
  });

  res.status(201).json({
    message: "Pendaftaran berhasil dikirim",
    application,
  });
});

export default router;
