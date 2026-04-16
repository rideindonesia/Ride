import { Router } from "express";
import { db, usersTable, otpCodesTable, mitraLocationsTable, ordersTable } from "@workspace/db";
import { eq, and, gt, sql, avg, count, or, desc } from "drizzle-orm";
import { RegisterPenggunaBody, VerifyOtpPenggunaBody, ResendOtpPenggunaBody } from "@workspace/api-zod";
import crypto from "crypto";

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

// GET /api/pengguna/mitra-online?lat=X&lng=Y
router.get("/mitra-online", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  const base = {
    id: mitraLocationsTable.id,
    userId: mitraLocationsTable.userId,
    name: usersTable.name,
    lat: mitraLocationsTable.lat,
    lng: mitraLocationsTable.lng,
    serviceType: mitraLocationsTable.serviceType,
  };

  let rows;
  if (isNaN(lat) || isNaN(lng)) {
    rows = await db.select(base)
      .from(mitraLocationsTable)
      .innerJoin(usersTable, eq(usersTable.id, mitraLocationsTable.userId))
      .where(eq(mitraLocationsTable.isOnline, true));
  } else {
    const latDelta = 0.18, lngDelta = 0.22;
    rows = await db.select(base)
      .from(mitraLocationsTable)
      .innerJoin(usersTable, eq(usersTable.id, mitraLocationsTable.userId))
      .where(and(
        eq(mitraLocationsTable.isOnline, true),
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

// POST /api/pengguna/orders — buat order baru
router.post("/orders", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const { vehicleType, vehicleModel, vehicleYear, damageCategories, description,
    pickupAddress, detailAlamat, pickupLat, pickupLng, serviceType } = req.body;

  if (!vehicleModel || !pickupAddress) {
    res.status(400).json({ error: "Data tidak lengkap" }); return;
  }

  const orderNo = `ORD${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2,6).toUpperCase()}`;

  const [order] = await db.insert(ordersTable).values({
    orderNo,
    penggunaId,
    serviceType: serviceType ?? "bengkel",
    vehicleType,
    vehicleModel,
    vehicleYear,
    damageCategories: Array.isArray(damageCategories) ? damageCategories : [],
    description,
    pickupAddress,
    detailAlamat,
    pickupLat: typeof pickupLat === "number" ? pickupLat : null,
    pickupLng: typeof pickupLng === "number" ? pickupLng : null,
    status: "pending",
  }).returning({ id: ordersTable.id, orderNo: ordersTable.orderNo });

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
    const [mitraUser] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, order.mitraId));
    const [mitraLoc] = await db.select({ lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng, serviceType: mitraLocationsTable.serviceType })
      .from(mitraLocationsTable).where(eq(mitraLocationsTable.userId, order.mitraId));
    const [stats] = await db.select({ rating: avg(ordersTable.rating), totalOrders: count(ordersTable.id) })
      .from(ordersTable).where(and(eq(ordersTable.mitraId, order.mitraId), eq(ordersTable.status, "done")));

    mitraInfo = {
      id: order.mitraId,
      name: mitraUser?.name ?? "",
      lat: mitraLoc?.lat ?? 0,
      lng: mitraLoc?.lng ?? 0,
      serviceType: mitraLoc?.serviceType ?? "",
      rating: stats?.rating != null ? parseFloat(Number(stats.rating).toFixed(1)) : null,
      totalOrders: Number(stats?.totalOrders) || 0,
    };
  }

  res.json({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    trackingPhase: order.trackingPhase ?? "menuju",
    paymentData: order.paymentData ?? null,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    pickupAddress: order.pickupAddress,
    vehicleModel: order.vehicleModel,
    vehicleYear: order.vehicleYear,
    damageCategories: order.damageCategories,
    totalAmount: order.totalAmount,
    platformFee: order.platformFee,
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

  res.json({
    order: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      trackingPhase: order.trackingPhase ?? "menuju",
      vehicleModel: order.vehicleModel,
      damageCategories: order.damageCategories,
      mitraName,
    }
  });
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

  const [updated] = await db.update(ordersTable)
    .set({ rating, reviewComment: comment?.trim() || null, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)))
    .returning({ id: ordersTable.id });

  if (!updated) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
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
// GET /api/pengguna/order-history — riwayat order selesai milik pengguna
router.get("/order-history", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

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
  }).from(ordersTable)
    .where(and(eq(ordersTable.penggunaId, penggunaId), eq(ordersTable.status, "done")))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  res.json({ orders });
});

router.delete("/orders/:id", async (req, res) => {
  const penggunaId = getPenggunaId(req);
  if (!penggunaId) { res.status(401).json({ error: "Belum login" }); return; }

  const orderId = parseInt(req.params.id);
  await db.update(ordersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.penggunaId, penggunaId)));

  res.json({ ok: true });
});

export default router;
