import { Router } from "express";
import { db, usersTable, otpCodesTable, mitraLocationsTable, ordersTable, vouchersTable, reportsTable } from "@workspace/db";
import { eq, and, gt, sql, avg, count, or, desc, aliasedTable, isNull, lt, inArray, SQL } from "drizzle-orm";
import { RegisterPenggunaBody, VerifyOtpPenggunaBody, ResendOtpPenggunaBody } from "@workspace/api-zod";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { io } from "../socket";
import { sendPushToUsers } from "./push";

// Profile photo upload setup
const profileUploadDir = path.resolve(process.cwd(), "uploads", "profile");
if (!fs.existsSync(profileUploadDir)) fs.mkdirSync(profileUploadDir, { recursive: true });

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profileUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadPhoto = multer({ storage: profileStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true); else cb(new Error("Hanya file gambar yang diperbolehkan"));
}});

// Order photo (foto kendaraan pengguna) upload setup
const orderPhotoDir = path.resolve(process.cwd(), "uploads", "order-photos");
if (!fs.existsSync(orderPhotoDir)) fs.mkdirSync(orderPhotoDir, { recursive: true });
const orderPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, orderPhotoDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `ord-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadOrderPhoto = multer({ storage: orderPhotoStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true); else cb(new Error("Hanya file gambar yang diperbolehkan"));
}});

const router = Router();

/** Read pengguna userId from signed role-cookie (survives cross-role login) or fall back to session */
function getPenggunaId(req: any): number | null {
  const fromCookie = req.signedCookies?.["ride-p-uid"];
  if (fromCookie) {
    const n = parseInt(fromCookie);
    if (!isNaN(n)) return n;
  }
  const fromSession = req.session?.userId;
  if (fromSession && req.session?.userRole === "pengguna") return fromSession as number;
  return null;
}

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

// GET /api/pengguna/mitra-online?lat=X&lng=Y&serviceType=bengkel
router.get("/mitra-online", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const serviceType = (req.query.serviceType as string) || null;

  const base = {
    id: mitraLocationsTable.id,
    userId: mitraLocationsTable.userId,
    name: usersTable.name,
    lat: mitraLocationsTable.lat,
    lng: mitraLocationsTable.lng,
    serviceType: mitraLocationsTable.serviceType,
  };

  const conditions: SQL[] = [eq(mitraLocationsTable.isOnline, true)];
  if (serviceType) conditions.push(eq(mitraLocationsTable.serviceType, serviceType));

  let rows;
  if (isNaN(lat) || isNaN(lng)) {
    rows = await db.select(base)
      .from(mitraLocationsTable)
      .innerJoin(usersTable, eq(usersTable.id, mitraLocationsTable.userId))
      .where(and(...conditions));
  } else {
    const latDelta = 0.18, lngDelta = 0.22;
    rows = await db.select(base)
      .from(mitraLocationsTable)
      .innerJoin(usersTable, eq(usersTable.id, mitraLocationsTable.userId))
      .where(and(
        ...conditions,
        sql`${mitraLocationsTable.lat} BETWEEN ${lat - latDelta} AND ${lat + latDelta}`,
        sql`${mitraLocationsTable.lng} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}`,
      ));
  }

  // Enrich each mitra with real rating + total orders
  const mitra = await Promise.all(rows.map(async m => {
    const [stats] = await db.select({
      rating: avg(ordersTable.rating),
      totalOrders: count(ordersTable.id),
    }).from(ordersTable).where(and(eq(ordersTable.mitraId, m.userId), eq(ordersTable.status, "done")));
    return {
      ...m,
      rating: stats?.rating != null ? parseFloat(Number(stats.rating).toFixed(1)) : null,
      totalOrders: Number(stats?.totalOrders) || 0,
    };
  }));

  res.json({ mitra });
});

// POST /api/pengguna/orders — buat order baru (multipart/form-data, foto opsional)
router.post("/orders", (req, res, next) => {
  uploadOrderPhoto.single("foto")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const { vehicleType, vehicleModel, vehicleYear, damageCategories, description,
    pickupAddress, detailAlamat, pickupLat, pickupLng, serviceType } = req.body;

  if (!vehicleModel || !pickupAddress) {
    res.status(400).json({ error: "Data tidak lengkap" }); return;
  }

  const orderNo = `ORD${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2,6).toUpperCase()}`;

  const svcType = serviceType ?? "bengkel";
  // Foto kendaraan pengguna (opsional)
  const penggunaPhotoPath = req.file ? `/uploads/order-photos/${req.file.filename}` : null;

  // damageCategories bisa string (FormData) atau array (JSON)
  let dmgCats: string[] = [];
  if (Array.isArray(damageCategories)) dmgCats = damageCategories;
  else if (typeof damageCategories === "string") { try { dmgCats = JSON.parse(damageCategories); } catch { dmgCats = []; } }

  const [order] = await db.insert(ordersTable).values({
    orderNo,
    penggunaId,
    serviceType: svcType,
    vehicleType,
    vehicleModel,
    vehicleYear,
    damageCategories: dmgCats,
    description,
    pickupAddress,
    detailAlamat,
    pickupLat: typeof pickupLat === "number" ? pickupLat : (pickupLat ? parseFloat(pickupLat) : null),
    pickupLng: typeof pickupLng === "number" ? pickupLng : (pickupLng ? parseFloat(pickupLng) : null),
    status: "pending",
    penggunaPhotoPath,
  }).returning({ id: ordersTable.id, orderNo: ordersTable.orderNo });

  // Notify only available (online + no active order) mitra of this service type
  try {
    const [pengguna] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, penggunaId)).limit(1);

    // Get all online mitra for this service type
    const onlineMitra = await db.select({ userId: mitraLocationsTable.userId })
      .from(mitraLocationsTable)
      .where(and(eq(mitraLocationsTable.isOnline, true), eq(mitraLocationsTable.serviceType, svcType)));

    // Filter out mitra who already have an active order
    const busyMitra = await db.select({ mitraId: ordersTable.mitraId })
      .from(ordersTable)
      .where(and(
        inArray(ordersTable.status, ["accepted", "menuju", "tiba", "pengerjaan"]),
        inArray(ordersTable.mitraId, onlineMitra.map(m => m.userId).filter((id): id is number => id !== null))
      ));
    const busyIds = new Set(busyMitra.map(b => b.mitraId));

    const availableMitra = onlineMitra.filter(m => m.userId !== null && !busyIds.has(m.userId));

    const payload = {
      id: order.id,
      orderNo: order.orderNo,
      serviceType: svcType,
      vehicleType,
      vehicleModel,
      vehicleYear,
      damageCategories: dmgCats,
      description: description ?? null,
      pickupAddress,
      pickupLat: typeof pickupLat === "number" ? pickupLat : (pickupLat ? parseFloat(pickupLat) : null),
      pickupLng: typeof pickupLng === "number" ? pickupLng : (pickupLng ? parseFloat(pickupLng) : null),
      penggunaName: pengguna?.name ?? "",
      penggunaPhotoPath,
      totalAmount: 0,
      platformFee: 0,
      createdAt: new Date().toISOString(),
    };

    // Emit individually to each available mitra
    for (const m of availableMitra) {
      io?.to(`user:${m.userId}`).emit("order:new", payload);
    }
    io?.to("room:admin").emit("admin:order_update", { type: "new", orderId: order.id });
  } catch {}

  res.json({ orderId: order.id, orderNo: order.orderNo });
});

// GET /api/pengguna/orders/:id — poll status order
router.get("/orders/:id", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }

  // If accepted, fetch mitra info
  let mitraInfo = null;
  if (order.mitraId) {
    const [mitraUser] = await db.select({ name: usersTable.name, profilePhotoPath: usersTable.profilePhotoPath })
      .from(usersTable).where(eq(usersTable.id, order.mitraId));
    const [mitraLoc] = await db.select({ lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng, speedKmh: mitraLocationsTable.speedKmh, serviceType: mitraLocationsTable.serviceType })
      .from(mitraLocationsTable).where(eq(mitraLocationsTable.userId, order.mitraId));
    const [stats] = await db.select({ rating: avg(ordersTable.rating), totalOrders: count(ordersTable.id) })
      .from(ordersTable).where(and(eq(ordersTable.mitraId, order.mitraId), eq(ordersTable.status, "done")));

    mitraInfo = {
      id: order.mitraId,
      name: mitraUser?.name ?? "",
      profilePhotoPath: mitraUser?.profilePhotoPath ?? null,
      lat: mitraLoc?.lat ?? 0,
      lng: mitraLoc?.lng ?? 0,
      speedKmh: mitraLoc?.speedKmh ?? 0,
      serviceType: mitraLoc?.serviceType ?? "",
      rating: stats?.rating != null ? parseFloat(Number(stats.rating).toFixed(1)) : null,
      totalOrders: Number(stats?.totalOrders) || 0,
    };
  }

  res.json({
    id: order.id,
    orderNo: order.orderNo,
    serviceType: order.serviceType,
    status: order.status,
    trackingPhase: order.trackingPhase ?? "menuju",
    paymentData: order.paymentData ?? null,
    penggunaConfirmed: order.penggunaConfirmed ?? false,
    paymentConfirmedAt: order.paymentConfirmedAt ?? null,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    pickupAddress: order.pickupAddress,
    vehicleType: order.vehicleType,
    vehicleModel: order.vehicleModel,
    vehicleYear: order.vehicleYear,
    damageCategories: order.damageCategories,
    description: order.description,
    totalAmount: order.totalAmount,
    platformFee: order.platformFee,
    rating: order.rating ?? null,
    reviewComment: order.reviewComment ?? null,
    createdAt: order.createdAt,
    mitra: mitraInfo,
  });
});

// GET /api/pengguna/active-order — get current active order (pending/accepted)
router.get("/active-order", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  // Hanya tampilkan order yang:
  // 1. status accepted AND diupdate dalam 8 jam terakhir (menghindari order terbengkalai)
  // 2. ATAU status accepted AND phase selesai (menunggu pembayaran, perlu tetap tampil)
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const [order] = await db.select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.penggunaId, penggunaId),
      eq(ordersTable.status, "accepted"),
      or(
        gt(ordersTable.updatedAt, eightHoursAgo),
        eq(ordersTable.trackingPhase, "selesai")
      )
    ))
    .orderBy(desc(ordersTable.updatedAt))
    .limit(1);

  if (!order) { res.json({ order: null }); return; }

  let mitraName: string | null = null;
  if (order.mitraId) {
    const [mitraUser] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, order.mitraId));
    mitraName = mitraUser?.name ?? null;
  }

  let mitraLoc = null;
  if (order.mitraId) {
    const [ml] = await db.select({ lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng, speedKmh: mitraLocationsTable.speedKmh })
      .from(mitraLocationsTable).where(eq(mitraLocationsTable.userId, order.mitraId));
    mitraLoc = ml ?? null;
  }

  res.json({
    order: {
      id: order.id,
      orderNo: order.orderNo,
      serviceType: order.serviceType,
      status: order.status,
      trackingPhase: order.trackingPhase ?? "menuju",
      paymentData: order.paymentData ?? null,
      penggunaConfirmed: order.penggunaConfirmed ?? false,
      vehicleType: order.vehicleType,
      vehicleModel: order.vehicleModel,
      vehicleYear: order.vehicleYear,
      damageCategories: order.damageCategories,
      description: order.description,
      pickupAddress: order.pickupAddress,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      totalAmount: order.totalAmount,
      platformFee: order.platformFee,
      mitraId: order.mitraId,
      mitraName,
      mitraLat: mitraLoc?.lat ?? null,
      mitraLng: mitraLoc?.lng ?? null,
      mitraSpeedKmh: mitraLoc?.speedKmh ?? 0,
      createdAt: order.createdAt,
    }
  });
});

// PATCH /api/pengguna/orders/:id/confirm — pengguna setuju & panggil mitra
router.patch("/orders/:id/confirm", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const [order] = await db.update(ordersTable)
    .set({ penggunaConfirmed: true, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId), eq(ordersTable.status, "accepted")))
    .returning({ mitraId: ordersTable.mitraId });

  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }

  try {
    if (order.mitraId) {
      io?.to(`user:${order.mitraId}`).emit("order:confirmed", { orderId });
      // Push ke mitra (walau browser ditutup)
      sendPushToUsers([order.mitraId], {
        title: "🚀 Konsumen Siap!",
        body: "Konsumen telah mengkonfirmasi. Segera menuju lokasi!",
        url: "/",
      });
    }
  } catch {}

  res.json({ ok: true });
});

// POST /api/pengguna/orders/:id/confirm-payment — konfirmasi pembayaran oleh pengguna
router.post("/orders/:id/confirm-payment", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const { paymentMethod, voucherCode } = req.body as { paymentMethod: string; voucherCode?: string | null };
  if (!paymentMethod) { res.status(400).json({ error: "paymentMethod wajib diisi" }); return; }

  const [order] = await db.select({
    id: ordersTable.id,
    status: ordersTable.status,
    penggunaId: ordersTable.penggunaId,
    paymentData: ordersTable.paymentData,
    paymentConfirmedAt: ordersTable.paymentConfirmedAt,
  }).from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (!order.paymentData) { res.status(400).json({ error: "Data pembayaran belum tersedia" }); return; }
  if (order.paymentConfirmedAt) { res.json({ ok: true, alreadyConfirmed: true }); return; }

  let total: number = (order.paymentData as any).total ?? 0;
  let discount = 0;

  // Terapkan voucher jika ada
  if (voucherCode) {
    const now = new Date();
    const [voucher] = await db.select().from(vouchersTable)
      .where(and(
        eq(vouchersTable.code, voucherCode.toUpperCase()),
        eq(vouchersTable.isActive, true),
        or(isNull(vouchersTable.expiresAt), gt(vouchersTable.expiresAt, now))
      )).limit(1);

    if (voucher) {
      const withinUsageLimit = !voucher.usageLimit || voucher.usageCount < voucher.usageLimit;
      if (withinUsageLimit && total >= voucher.minOrder) {
        if (voucher.discountType === "percent") {
          discount = Math.round((total * voucher.discountValue) / 100);
          if (voucher.maxDiscount) discount = Math.min(discount, voucher.maxDiscount);
        } else {
          discount = Math.min(voucher.discountValue, total);
        }
        await db.update(vouchersTable)
          .set({ usageCount: sql`${vouchersTable.usageCount} + 1` })
          .where(eq(vouchersTable.id, voucher.id));
      }
    }
  }

  const finalTotal = Math.max(0, total - discount);

  // Simpan metode pembayaran + waktu konfirmasi + penggunaConfirmed (status TETAP accepted, tunggu mitra konfirmasi)
  const updatedPaymentData = { ...(order.paymentData as any), paymentMethod, discount, finalTotal };
  const [updated] = await db.update(ordersTable)
    .set({
      paymentData: updatedPaymentData,
      paymentConfirmedAt: new Date(),
      penggunaConfirmed: true,
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId))
    .returning({ mitraId: ordersTable.mitraId, penggunaId: ordersTable.penggunaId });

  // Notifikasi mitra: konsumen sudah konfirmasi bayar — mitra yang klik selesai
  if (updated?.mitraId) {
    io?.to(`user:${updated.mitraId}`).emit("order:payment_confirmed", {
      orderId, discount, finalTotal, paymentMethod,
    });
    sendPushToUsers([updated.mitraId], {
      title: "💰 Konsumen Konfirmasi Bayar!",
      body: `Konsumen sudah konfirmasi bayar via ${paymentMethod === "cash" ? "tunai" : paymentMethod}. Harap konfirmasi terima pembayaran.`,
      url: "/",
    });
  }

  res.json({ ok: true, discount, finalTotal });
});

// POST /api/pengguna/orders/:id/review — kirim ulasan & rating
router.post("/orders/:id/review", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  const { rating, comment } = req.body as { rating: number; comment?: string };

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating harus antara 1-5" }); return;
  }

  // Cek apakah order ada dan milik pengguna ini
  const [existing] = await db.select({ id: ordersTable.id, status: ordersTable.status, rating: ordersTable.rating })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (existing.status !== "done") { res.status(400).json({ error: "Hanya bisa memberi rating untuk order yang sudah selesai" }); return; }
  if (existing.rating !== null) { res.status(409).json({ error: "Rating sudah pernah diberikan untuk order ini" }); return; }

  await db.update(ordersTable)
    .set({ rating, reviewComment: comment?.trim() || null, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  // Notify mitra bahwa ada rating baru
  const [order] = await db.select({ mitraId: ordersTable.mitraId }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (order?.mitraId) {
    io?.to(`user:${order.mitraId}`).emit("order:rated", { orderId, rating, comment: comment?.trim() || null });
  }

  res.json({ ok: true });
});

// GET /api/pengguna/orders/:id/receipt — data untuk struk
router.get("/orders/:id/receipt", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }

  let mitraName: string | null = null;
  if (order.mitraId) {
    const [m] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, order.mitraId));
    mitraName = m?.name ?? null;
  }
  const [pengguna] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, penggunaId));

  res.json({
    orderNo: order.orderNo,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    penggunaName: pengguna?.name ?? null,
    mitraName,
    vehicleModel: order.vehicleModel,
    vehicleYear: order.vehicleYear,
    damageCategories: order.damageCategories,
    pickupAddress: order.pickupAddress,
    paymentData: order.paymentData,
    totalAmount: order.totalAmount,
    rating: order.rating,
    reviewComment: order.reviewComment,
  });
});

// DELETE /api/pengguna/orders/:id — batalkan order
// GET /api/pengguna/order-history — riwayat order selesai & dibatalkan milik pengguna
router.get("/order-history", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const mitraUsers = aliasedTable(usersTable, "mitra_users");

  const orders = await db.select({
    id: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    vehicleModel: ordersTable.vehicleModel,
    vehicleYear: ordersTable.vehicleYear,
    damageCategories: ordersTable.damageCategories,
    pickupAddress: ordersTable.pickupAddress,
    totalAmount: ordersTable.totalAmount,
    paymentData: ordersTable.paymentData,
    createdAt: ordersTable.createdAt,
    status: ordersTable.status,
    rating: ordersTable.rating,
    reviewComment: ordersTable.reviewComment,
    cancelReason: ordersTable.cancelReason,
    canceledBy: ordersTable.canceledBy,
    mitraName: mitraUsers.name,
  }).from(ordersTable)
    .leftJoin(mitraUsers, eq(ordersTable.mitraId, mitraUsers.id))
    .where(and(eq(ordersTable.penggunaId, penggunaId), inArray(ordersTable.status, ["done", "cancelled"])))
    .orderBy(desc(ordersTable.createdAt))
    .limit(30);

  res.json({ orders });
});

router.delete("/orders/:id", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  const cancelReason: string | undefined = req.body?.cancelReason;

  const [cancelled] = await db.update(ordersTable)
    .set({
      status: "cancelled",
      canceledBy: "pengguna",
      cancelReason: cancelReason ?? null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.penggunaId, penggunaId),
      or(eq(ordersTable.status, "pending"), eq(ordersTable.status, "accepted")) as any,
    ))
    .returning({ id: ordersTable.id, mitraId: ordersTable.mitraId });

  if (cancelled) {
    try {
      io?.to(`order:${cancelled.id}`).emit("order:cancelled", { orderId: cancelled.id, canceledBy: "pengguna", cancelReason });
      if (cancelled.mitraId) {
        io?.to(`mitra:${cancelled.mitraId}`).emit("order:cancelled", { orderId: cancelled.id, canceledBy: "pengguna", cancelReason });
      }
      io?.to("room:admin").emit("admin:order_update", { type: "cancelled", orderId: cancelled.id });
    } catch { /* ignore */ }
  }

  res.json({ ok: !!cancelled });
});

// GET /api/pengguna/profile — profil lengkap pengguna
router.get("/profile", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const [user] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    phone: usersTable.phone, createdAt: usersTable.createdAt,
    profilePhotoPath: usersTable.profilePhotoPath,
    walletBalance: usersTable.walletBalance,
  }).from(usersTable).where(eq(usersTable.id, penggunaId)).limit(1);
  if (!user) { res.status(404).json({ error: "User tidak ditemukan" }); return; }
  res.json(user);
});

// PUT /api/pengguna/profile — update nama
router.put("/profile", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "Nama tidak boleh kosong" }); return; }
  await db.update(usersTable).set({ name: name.trim() }).where(eq(usersTable.id, penggunaId));
  res.json({ ok: true, name: name.trim() });
});

// PUT /api/pengguna/change-password
router.put("/change-password", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "Semua field wajib diisi" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ error: "Password baru minimal 8 karakter" }); return; }
  const [user] = await db.select({ passwordHash: usersTable.passwordHash })
    .from(usersTable).where(eq(usersTable.id, penggunaId)).limit(1);
  if (!user) { res.status(404).json({ error: "User tidak ditemukan" }); return; }
  if (user.passwordHash !== hashPassword(currentPassword)) {
    res.status(400).json({ error: "Password lama tidak sesuai" }); return;
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, penggunaId));
  res.json({ ok: true });
});

// POST /api/pengguna/upload-photo — upload foto profil
router.post("/upload-photo", (req, res, next) => {
  uploadPhoto.single("photo")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  if (!req.file) { res.status(400).json({ error: "Tidak ada file yang diunggah" }); return; }
  const relativePath = `/uploads/profile/${req.file.filename}`;
  await db.update(usersTable).set({ profilePhotoPath: relativePath }).where(eq(usersTable.id, penggunaId));
  res.json({ ok: true, photoUrl: relativePath });
});

// POST /api/pengguna/request-profile-otp — minta OTP untuk ganti HP/email
router.post("/request-profile-otp", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { field, value } = req.body as { field: "phone" | "email"; value: string };
  if (!field || !value) { res.status(400).json({ error: "Field dan value wajib diisi" }); return; }
  if (field !== "phone" && field !== "email") { res.status(400).json({ error: "Field tidak valid" }); return; }
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    res.status(400).json({ error: "Format email tidak valid" }); return;
  }
  // Check uniqueness
  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      field === "email" ? eq(usersTable.email, value) : eq(usersTable.phone, value),
    )).limit(1);
  if (existing.length > 0 && existing[0].id !== penggunaId) {
    res.status(409).json({ error: `${field === "email" ? "Email" : "Nomor HP"} sudah digunakan akun lain` }); return;
  }
  const otp = generateOtp();
  (req.session as any).profileOtp = { code: otp, field, value, userId: penggunaId, expiresAt: Date.now() + 10 * 60 * 1000 };
  // Demo mode: return OTP in response
  res.json({ ok: true, message: `Kode OTP telah dikirim ke ${value}`, otpDemo: otp });
});

// POST /api/pengguna/verify-profile-otp — verifikasi OTP dan simpan perubahan
router.post("/verify-profile-otp", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { otp } = req.body as { otp: string };
  if (!otp) { res.status(400).json({ error: "Kode OTP wajib diisi" }); return; }
  const pending = (req.session as any).profileOtp as { code: string; field: string; value: string; userId: number; expiresAt: number } | undefined;
  if (!pending) { res.status(400).json({ error: "Tidak ada permintaan OTP aktif" }); return; }
  if (pending.userId !== penggunaId) { res.status(403).json({ error: "OTP bukan milik Anda" }); return; }
  if (Date.now() > pending.expiresAt) {
    delete (req.session as any).profileOtp;
    res.status(400).json({ error: "Kode OTP sudah kadaluarsa" }); return;
  }
  if (otp.trim() !== pending.code) { res.status(400).json({ error: "Kode OTP tidak valid" }); return; }
  const update: Record<string, string> = {};
  update[pending.field === "phone" ? "phone" : "email"] = pending.value;
  await db.update(usersTable).set(update as any).where(eq(usersTable.id, penggunaId));
  delete (req.session as any).profileOtp;
  res.json({ ok: true, field: pending.field, value: pending.value });
});

// GET /api/pengguna/vouchers/active — ambil voucher yang masih aktif & belum habis
router.get("/vouchers/active", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const now = new Date();
  const rows = await db
    .select({
      id: vouchersTable.id,
      code: vouchersTable.code,
      discountType: vouchersTable.discountType,
      discountValue: vouchersTable.discountValue,
      minOrder: vouchersTable.minOrder,
      maxDiscount: vouchersTable.maxDiscount,
      description: vouchersTable.description,
      expiresAt: vouchersTable.expiresAt,
      usageLimit: vouchersTable.usageLimit,
      usageCount: vouchersTable.usageCount,
    })
    .from(vouchersTable)
    .where(
      and(
        eq(vouchersTable.isActive, true),
        or(isNull(vouchersTable.expiresAt), gt(vouchersTable.expiresAt, now)),
        or(isNull(vouchersTable.usageLimit), lt(vouchersTable.usageCount, vouchersTable.usageLimit))
      )
    )
    .orderBy(desc(vouchersTable.createdAt))
    .limit(10);
  res.json({ vouchers: rows });
});

// GET /api/pengguna/vouchers/check?code=RIDE10&total=50000 — validasi voucher & hitung diskon
router.get("/vouchers/check", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const code = String(req.query.code ?? "").toUpperCase().trim();
  const total = parseInt(String(req.query.total ?? "0")) || 0;

  if (!code) { res.status(400).json({ error: "Kode voucher wajib diisi" }); return; }

  const now = new Date();
  const [voucher] = await db.select().from(vouchersTable)
    .where(and(
      eq(vouchersTable.code, code),
      eq(vouchersTable.isActive, true),
      or(isNull(vouchersTable.expiresAt), gt(vouchersTable.expiresAt, now))
    )).limit(1);

  if (!voucher) { res.json({ valid: false, error: "Kode voucher tidak valid atau sudah kadaluarsa" }); return; }

  const withinUsageLimit = !voucher.usageLimit || voucher.usageCount < voucher.usageLimit;
  if (!withinUsageLimit) { res.json({ valid: false, error: "Voucher sudah mencapai batas penggunaan" }); return; }

  if (total < voucher.minOrder) {
    res.json({ valid: false, error: `Minimum order Rp ${voucher.minOrder.toLocaleString("id-ID")} untuk voucher ini` }); return;
  }

  let discount = 0;
  if (voucher.discountType === "percent") {
    discount = Math.round((total * voucher.discountValue) / 100);
    if (voucher.maxDiscount) discount = Math.min(discount, voucher.maxDiscount);
  } else {
    discount = Math.min(voucher.discountValue, total);
  }

  res.json({
    valid: true,
    code: voucher.code,
    discount,
    finalTotal: Math.max(0, total - discount),
    description: voucher.description ?? "",
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
  });
});

// GET /api/pengguna/reports — ambil laporan milik user ini
router.get("/reports", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const rows = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.userId, penggunaId))
    .orderBy(desc(reportsTable.createdAt))
    .limit(50);
  res.json({ reports: rows });
});

// POST /api/pengguna/reports — kirim laporan baru
router.post("/reports", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { type, title, message, orderId, orderNo } = req.body as { type?: string; title: string; message: string; orderId?: number; orderNo?: string };
  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Judul dan isi laporan wajib diisi" }); return;
  }
  const [inserted] = await db.insert(reportsTable).values({
    userId: penggunaId,
    orderId: orderId ?? null,
    orderNo: orderNo ?? null,
    type: type ?? "general",
    title: title.trim(),
    message: message.trim(),
    status: "open",
  }).returning();
  res.json({ ok: true, report: inserted });
});

// GET /api/pengguna/tarif — ambil konfigurasi tarif dari sistem settings (public untuk pengguna login)
router.get("/tarif", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }
  const { systemSettingsTable } = await import("@workspace/db/schema");
  const rows = await db.select().from(systemSettingsTable);
  const cfg: Record<string, string> = {};
  rows.forEach(r => { cfg[r.key] = r.value; });
  res.json({ tarif: cfg });
});

export default router;
