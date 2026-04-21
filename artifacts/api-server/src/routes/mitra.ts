import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, mitraApplicationsTable, mitraLocationsTable, usersTable, ordersTable, reportsTable, systemSettingsTable } from "@workspace/db";
import { eq, and, or, gt, gte, desc, sql, avg, count, sum, inArray } from "drizzle-orm";
import crypto from "crypto";
import { io } from "../socket";
import { sendPushToUsers } from "./push";

const router = Router();

// ── Pricing helpers (mirrors artifacts/ride-splash/src/utils/pricing.ts) ──
const CALL_FEE_CONFIG: Record<string, { base: number; freeKm: number; perKm: number }> = {
  bengkel:    { base: 12000, freeKm: 3, perKm: 2500 },
  elektronik: { base: 12000, freeKm: 3, perKm: 2500 },
  barber:     { base: 12000, freeKm: 3, perKm: 2500 },
  cuci:       { base: 12000, freeKm: 3, perKm: 2500 },
  inspeksi:   { base: 20000, freeKm: 3, perKm: 3000 },
  towing:     { base: 75000, freeKm: 3, perKm: 8000 },
};
const BIAYA_LAYANAN = 2000;
function serverCalcBiayaPanggilan(serviceType: string, distKm: number): number {
  const key = serviceType.toLowerCase().replace(/[\s_-]+/g, "");
  const cfg = CALL_FEE_CONFIG[key] ?? CALL_FEE_CONFIG.bengkel;
  const raw = cfg.base + Math.max(0, distKm - cfg.freeKm) * cfg.perKm;
  return Math.round(raw / 500) * 500;
}
function serverHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const uploadDir = path.resolve(process.cwd(), "uploads", "mitra");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const profileUploadDir = path.resolve(process.cwd(), "uploads", "profile");
if (!fs.existsSync(profileUploadDir)) fs.mkdirSync(profileUploadDir, { recursive: true });

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

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profileUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadProfilePhoto = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Hanya format gambar yang didukung (jpg, png, webp)"));
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

/** Read mitra userId from signed role-cookie or fall back to session */
function getMitraId(req: any): number | null {
  const fromCookie = req.signedCookies?.["ride-m-uid"];
  if (fromCookie) {
    const n = parseInt(fromCookie);
    if (!isNaN(n)) return n;
  }
  const fromSession = req.session?.userId;
  if (fromSession && req.session?.userRole === "mitra") return fromSession as number;
  return null;
}

// Middleware: require mitra session
function requireMitra(req: any, res: any, next: any) {
  if (!getMitraId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// GET /api/mitra/dashboard
router.get("/dashboard", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);

  // Today stats
  const [todayStats] = await db.select({
    income: sum(ordersTable.totalAmount),
    orders: count(ordersTable.id),
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      eq(ordersTable.status, "done"),
      gte(ordersTable.createdAt, todayStart),
    ));

  // Overall rating
  const [ratingRow] = await db.select({ rating: avg(ordersTable.rating) })
    .from(ordersTable)
    .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done")));

  // Online status + service type from location
  const [locRow] = await db.select({ isOnline: mitraLocationsTable.isOnline, serviceType: mitraLocationsTable.serviceType })
    .from(mitraLocationsTable)
    .where(eq(mitraLocationsTable.userId, mitraId))
    .limit(1);

  // User info
  const [userRow] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, mitraId));

  // Get serviceType from mitra_applications if not in location row
  let serviceType = locRow?.serviceType ?? null;
  if (!serviceType) {
    const [appRow] = await db.select({ serviceType: mitraApplicationsTable.serviceType })
      .from(mitraApplicationsTable)
      .where(eq(mitraApplicationsTable.email, userRow?.email ?? ""))
      .limit(1);
    serviceType = appRow?.serviceType ?? null;
  }

  // Weekly chart (last 7 days)
  const weeklyRaw = await db.select({
    day: sql<string>`to_char(${ordersTable.createdAt}, 'Dy')`,
    dayNum: sql<number>`EXTRACT(DOW FROM ${ordersTable.createdAt})`,
    total: sum(ordersTable.totalAmount),
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      eq(ordersTable.status, "done"),
      gte(ordersTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    ))
    .groupBy(sql`to_char(${ordersTable.createdAt}, 'Dy')`, sql`EXTRACT(DOW FROM ${ordersTable.createdAt})`)
    .orderBy(sql`EXTRACT(DOW FROM ${ordersTable.createdAt})`);

  // Monthly chart (last 6 months)
  const monthlyRaw = await db.select({
    month: sql<string>`to_char(${ordersTable.createdAt}, 'Mon')`,
    monthNum: sql<number>`EXTRACT(MONTH FROM ${ordersTable.createdAt})`,
    total: sum(ordersTable.totalAmount),
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      eq(ordersTable.status, "done"),
      gte(ordersTable.createdAt, new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)),
    ))
    .groupBy(sql`to_char(${ordersTable.createdAt}, 'Mon')`, sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`);

  // Recent orders (last 10 done)
  const recentOrders = await db.select({
    id: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    vehicleModel: ordersTable.vehicleModel,
    vehicleYear: ordersTable.vehicleYear,
    damageCategories: ordersTable.damageCategories,
    pickupAddress: ordersTable.pickupAddress,
    totalAmount: ordersTable.totalAmount,
    platformFee: ordersTable.platformFee,
    paymentData: ordersTable.paymentData,
    penggunaName: usersTable.name,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
    .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done")))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  // Platform fee history (group by 7-day periods)
  const feeHistoryRaw = await db.select({
    weekStart: sql<string>`to_char(date_trunc('week', ${ordersTable.createdAt}), 'DD Mon YYYY')`,
    weekEnd: sql<string>`to_char(date_trunc('week', ${ordersTable.createdAt}) + interval '6 days', 'DD Mon YYYY')`,
    weekEpoch: sql<string>`extract(epoch from date_trunc('week', ${ordersTable.createdAt}))`,
    omset: sum(ordersTable.totalAmount),
    fee: sum(ordersTable.platformFee),
  }).from(ordersTable)
    .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done")))
    .groupBy(sql`date_trunc('week', ${ordersTable.createdAt})`)
    .orderBy(desc(sql`date_trunc('week', ${ordersTable.createdAt})`))
    .limit(6);

  // Compute isPaid in JS: weeks that ended before the current week start are considered paid
  const feeHistory = feeHistoryRaw.map(f => ({
    weekStart: f.weekStart,
    weekEnd: f.weekEnd,
    omset: f.omset,
    fee: f.fee,
    isPaid: Number(f.weekEpoch) * 1000 < currentWeekStart.getTime(),
  }));

  // Days mapping for Indonesian
  const dayMap: Record<string, string> = {
    Mon: "Sen", Tue: "Sel", Wed: "Rab", Thu: "Kam", Fri: "Jum", Sat: "Sab", Sun: "Min",
  };
  const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date().getDay();
  const last7Days = Array.from({ length: 7 }, (_, i) => dayOrder[(today - 6 + i + 7) % 7]);
  const weeklyMap = Object.fromEntries(weeklyRaw.map(r => [r.day?.trim(), Number(r.total) || 0]));
  const weeklyChart = last7Days.map(d => ({
    label: dayMap[d] ?? d,
    value: weeklyMap[d] ?? 0,
  }));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthMapId: Record<string, string> = {
    Jan: "Jan", Feb: "Feb", Mar: "Mar", Apr: "Apr", May: "Mei", Jun: "Jun",
    Jul: "Jul", Aug: "Agu", Sep: "Sep", Oct: "Okt", Nov: "Nov", Dec: "Des",
  };
  const monthlyMap = Object.fromEntries(monthlyRaw.map(r => [r.month?.trim(), Number(r.total) || 0]));
  const thisMonth = new Date().getMonth();
  const last6Months = Array.from({ length: 6 }, (_, i) => monthNames[(thisMonth - 5 + i + 12) % 12]);
  const monthlyChart = last6Months.map(m => ({
    label: monthMapId[m] ?? m,
    value: monthlyMap[m] ?? 0,
  }));

  // Platform fee status — computed: unpaid if current week has fees not yet settled
  const [currentWeekFee] = await db.select({ fee: sum(ordersTable.platformFee) })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      eq(ordersTable.status, "done"),
      gte(ordersTable.createdAt, currentWeekStart),
    ));
  const pendingFeeAmount = Number(currentWeekFee?.fee) || 0;
  const platformFeeStatus = pendingFeeAmount > 0 ? "belum_lunas" : "lunas";
  const platformFeePending = pendingFeeAmount;

  const ratingValue = ratingRow?.rating != null ? parseFloat(Number(ratingRow.rating).toFixed(1)) : null;

  res.json({
    name: userRow?.name ?? "",
    serviceType,
    isOnline: locRow?.isOnline ?? false,
    todayIncome: Number(todayStats?.income) || 0,
    todayOrders: Number(todayStats?.orders) || 0,
    rating: ratingValue,
    platformFeeStatus,
    platformFeePending,
    weeklyChart,
    weeklyTotal: weeklyChart.reduce((s, d) => s + d.value, 0),
    weeklyBest: Math.max(...weeklyChart.map(d => d.value), 0),
    monthlyChart,
    recentOrders,
    platformFeeHistory: feeHistory,
  });
});

// PATCH /api/mitra/location — update posisi GPS + kecepatan mitra real-time
router.patch("/location", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { lat, lng, speedKmh } = req.body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat and lng required" });
    return;
  }
  const updates: Record<string, unknown> = { lat, lng, updatedAt: new Date() };
  if (typeof speedKmh === "number" && speedKmh >= 0 && speedKmh <= 200) {
    updates.speedKmh = speedKmh;
  }
  await db.update(mitraLocationsTable)
    .set(updates)
    .where(eq(mitraLocationsTable.userId, mitraId));

  // Emit real-time lokasi ke pengguna yang sedang order aktif dengan mitra ini
  const [activeOrder] = await db
    .select({ penggunaId: ordersTable.penggunaId })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      or(eq(ordersTable.status, "accepted"), eq(ordersTable.status, "in_progress"))
    ))
    .limit(1);
  if (activeOrder?.penggunaId) {
    io?.to(`user:${activeOrder.penggunaId}`).emit("mitra:location", {
      lat, lng, speedKmh: typeof speedKmh === "number" ? speedKmh : 0,
    });
  }

  res.json({ ok: true });
});

// PATCH /api/mitra/toggle-online
router.patch("/toggle-online", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { isOnline, lat, lng } = req.body;

  // Cegah mitra toggle ON jika sedang ada order aktif
  if (!!isOnline) {
    const [activeOrder] = await db.select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.mitraId, mitraId),
        inArray(ordersTable.status, ["accepted", "menuju", "tiba", "pengerjaan"])
      ))
      .limit(1);
    if (activeOrder) {
      res.status(409).json({ error: "Kamu sedang dalam order aktif. Selesaikan order terlebih dahulu sebelum mengubah status." });
      return;
    }
  }

  const existing = await db.select({ id: mitraLocationsTable.id, lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng })
    .from(mitraLocationsTable)
    .where(eq(mitraLocationsTable.userId, mitraId))
    .limit(1);

  if (existing.length > 0) {
    const updates: Record<string, unknown> = { isOnline: !!isOnline, updatedAt: new Date() };
    if (typeof lat === "number" && typeof lng === "number") {
      updates.lat = lat;
      updates.lng = lng;
    }
    await db.update(mitraLocationsTable).set(updates).where(eq(mitraLocationsTable.userId, mitraId));
  } else {
    // Lookup service type from mitra profile
    const [userRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, mitraId));
    const [appRow] = await db.select({ serviceType: mitraApplicationsTable.serviceType })
      .from(mitraApplicationsTable)
      .where(eq(mitraApplicationsTable.email, userRow?.email ?? ""))
      .limit(1);

    await db.insert(mitraLocationsTable).values({
      userId: mitraId,
      lat: typeof lat === "number" ? lat : 0,
      lng: typeof lng === "number" ? lng : 0,
      isOnline: !!isOnline,
      serviceType: appRow?.serviceType ?? null,
    });
  }

  res.json({ isOnline: !!isOnline });
});

// GET /api/mitra/incoming-orders
router.get("/incoming-orders", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;

  const [locRow] = await db.select({ serviceType: mitraLocationsTable.serviceType })
    .from(mitraLocationsTable)
    .where(eq(mitraLocationsTable.userId, mitraId))
    .limit(1);

  // Show pending orders that match mitra's serviceType and are unassigned (mitraId IS NULL)
  // If no serviceType match, fall back to all unassigned pending orders
  const whereClause = locRow?.serviceType
    ? and(
        eq(ordersTable.status, "pending"),
        sql`${ordersTable.mitraId} IS NULL`,
        eq(ordersTable.serviceType, locRow.serviceType),
      )
    : and(
        eq(ordersTable.status, "pending"),
        sql`${ordersTable.mitraId} IS NULL`,
      );

  const incoming = await db.select({
    id: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    vehicleType: ordersTable.vehicleType,
    vehicleModel: ordersTable.vehicleModel,
    vehicleYear: ordersTable.vehicleYear,
    damageCategories: ordersTable.damageCategories,
    description: ordersTable.description,
    pickupAddress: ordersTable.pickupAddress,
    pickupLat: ordersTable.pickupLat,
    pickupLng: ordersTable.pickupLng,
    totalAmount: ordersTable.totalAmount,
    platformFee: ordersTable.platformFee,
    penggunaName: usersTable.name,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
    .where(whereClause)
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);

  res.json({ incoming: incoming[0] ?? null });
});

// GET /api/mitra/active-order — kembalikan order aktif mitra beserta paymentData
router.get("/active-order", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const [order] = await db.select({
    id: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    vehicleType: ordersTable.vehicleType,
    vehicleModel: ordersTable.vehicleModel,
    vehicleYear: ordersTable.vehicleYear,
    damageCategories: ordersTable.damageCategories,
    description: ordersTable.description,
    pickupAddress: ordersTable.pickupAddress,
    pickupLat: ordersTable.pickupLat,
    pickupLng: ordersTable.pickupLng,
    totalAmount: ordersTable.totalAmount,
    platformFee: ordersTable.platformFee,
    trackingPhase: ordersTable.trackingPhase,
    penggunaConfirmed: ordersTable.penggunaConfirmed,
    paymentData: ordersTable.paymentData,
    penggunaName: usersTable.name,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      eq(ordersTable.status, "accepted"),
      or(
        gt(ordersTable.updatedAt, new Date(Date.now() - 8 * 60 * 60 * 1000)),
        eq(ordersTable.trackingPhase, "selesai")
      )
    ))
    .orderBy(desc(ordersTable.updatedAt))
    .limit(1);

  res.json({ order: order ?? null });
});

// PATCH /api/mitra/orders/:id/accept
router.patch("/orders/:id/accept", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);

  // Assign mitraId + set accepted
  const [updated] = await db.update(ordersTable)
    .set({ status: "accepted", mitraId, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
    .returning({
      penggunaId: ordersTable.penggunaId,
      orderNo: ordersTable.orderNo,
      serviceType: ordersTable.serviceType,
      pickupLat: ordersTable.pickupLat,
      pickupLng: ordersTable.pickupLng,
    });

  try {
    if (updated) {
      const [mitraUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, mitraId)).limit(1);
      const [mitraLoc] = await db.select({ lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng })
        .from(mitraLocationsTable).where(eq(mitraLocationsTable.userId, mitraId)).limit(1);

      // Calculate & store callFee at acceptance time — baca tarif dari DB
      const settingsRows = await db.select().from(systemSettingsTable);
      const sMap: Record<string, string> = {};
      settingsRows.forEach(r => { sMap[r.key] = r.value; });
      const freeKm = parseFloat(sMap["call_fee_free_km"] ?? "3") || 3;
      const svcKey = updated.serviceType.toLowerCase().replace(/[\s_-]+/g, "");
      const base = parseInt(sMap[`call_fee_${svcKey}_base`] ?? "") || (CALL_FEE_CONFIG[svcKey]?.base ?? 12000);
      const perKm = parseInt(sMap[`call_fee_${svcKey}_per_km`] ?? "") || (CALL_FEE_CONFIG[svcKey]?.perKm ?? 2500);
      const biayaLayananDB = parseInt(sMap["biaya_layanan_admin"] ?? "2000") || 2000;

      let distKm = 0;
      if (mitraLoc && updated.pickupLat != null && updated.pickupLng != null) {
        distKm = serverHaversineKm(mitraLoc.lat, mitraLoc.lng, updated.pickupLat, updated.pickupLng);
      }
      const rawFee = base + Math.max(0, distKm - freeKm) * perKm;
      let callFee = Math.round(rawFee / 500) * 500;
      await db.update(ordersTable).set({ totalAmount: callFee }).where(eq(ordersTable.id, orderId));

      io?.to(`user:${updated.penggunaId}`).emit("order:accepted", {
        orderId,
        orderNo: updated.orderNo,
        mitraId,
        mitraName: mitraUser?.name ?? "",
        mitraLat: mitraLoc?.lat ?? null,
        mitraLng: mitraLoc?.lng ?? null,
        callFee,
        biayaLayanan: biayaLayananDB,
      });
      io?.to("room:admin").emit("admin:order_update", { type: "accepted", orderId });
      // Push notification ke pengguna (walau browser ditutup)
      sendPushToUsers([updated.penggunaId], {
        title: "✅ Mitra Ditemukan!",
        body: `${mitraUser?.name ?? "Mitra"} menerima pesanan Anda. Ketuk untuk melihat detail.`,
        url: "/",
      });
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/reject
router.patch("/orders/:id/reject", requireMitra, async (req, res) => {
  const orderId = parseInt(req.params.id);

  // Just set cancelled — the order goes back to pool or stays cancelled
  await db.update(ordersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")));

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/cancel — mitra membatalkan order yang sudah diterima
router.patch("/orders/:id/cancel", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { cancelReason } = req.body as { cancelReason?: string };

  const [cancelled] = await db.update(ordersTable)
    .set({
      status: "cancelled",
      canceledBy: "mitra",
      cancelReason: cancelReason ?? null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.mitraId, mitraId),
      or(eq(ordersTable.status, "accepted"), eq(ordersTable.status, "pending")) as any,
    ))
    .returning({ id: ordersTable.id, penggunaId: ordersTable.penggunaId });

  if (cancelled) {
    try {
      io?.to(`order:${orderId}`).emit("order:cancelled", { orderId, canceledBy: "mitra", cancelReason });
      io?.to(`user:${cancelled.penggunaId}`).emit("order:cancelled", { orderId, canceledBy: "mitra", cancelReason });
      io?.to("room:admin").emit("admin:order_update", { type: "cancelled", orderId });
      sendPushToUsers([cancelled.penggunaId], {
        title: "❌ Mitra Membatalkan Order",
        body: cancelReason ? `Alasan: ${cancelReason}` : "Mitra tidak dapat melanjutkan pesanan.",
        url: "/",
      });
    } catch { /* ignore */ }
  }

  res.json({ ok: !!cancelled });
});

// PATCH /api/mitra/orders/:id/phase — update tracking phase
router.patch("/orders/:id/phase", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { phase } = req.body as { phase: string };
  const valid = ["menuju", "tiba", "pengerjaan", "selesai"];
  if (!valid.includes(phase)) { res.status(400).json({ error: "Phase tidak valid" }); return; }

  const [updated] = await db.update(ordersTable)
    .set({ trackingPhase: phase, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ penggunaId: ordersTable.penggunaId });

  // Notify pengguna of phase change in real-time + push notification
  try {
    if (updated) {
      io?.to(`user:${updated.penggunaId}`).emit("order:phase", { orderId, phase });
      // Push berdasarkan fase
      const phaseMessages: Record<string, { title: string; body: string }> = {
        tiba:       { title: "📍 Mitra Sudah Tiba!", body: "Mitra sudah tiba di lokasi Anda." },
        pengerjaan: { title: "🔧 Pengerjaan Dimulai", body: "Mitra sedang mengerjakan pesanan Anda." },
        selesai:    { title: "✅ Pesanan Selesai", body: "Layanan selesai. Silakan lakukan pembayaran." },
      };
      if (phaseMessages[phase]) {
        sendPushToUsers([updated.penggunaId], { ...phaseMessages[phase], url: "/" });
      }
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/payment-data — kirim rincian biaya ke pengguna
router.patch("/orders/:id/payment-data", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { biayaJasa, biayaSparepart, biayaPanggilan, biayaLayanan, total, paymentMethod } = req.body;
  const paymentData = { biayaJasa, biayaSparepart, biayaPanggilan, biayaLayanan, total, paymentMethod };

  // Cek apakah rincian sudah pernah dikirim — jika sudah, tolak edit ulang
  const [existing] = await db.select({ paymentData: ordersTable.paymentData, status: ordersTable.status })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (existing.paymentData != null) {
    res.status(409).json({ error: "Rincian biaya sudah dikirim ke konsumen dan tidak dapat diubah lagi" });
    return;
  }

  // Hitung platform fee: baca pct dari DB (default 15%)
  const callFee = Number(biayaPanggilan) || 0;
  const layanan = Number(biayaLayanan) || 0;
  const [feePctRow] = await db.select({ value: systemSettingsTable.value })
    .from(systemSettingsTable).where(eq(systemSettingsTable.key, "platform_fee_pct")).limit(1);
  const feePct = (parseFloat(feePctRow?.value ?? "15") || 15) / 100;
  const platformFee = Math.round(callFee * feePct) + layanan;

  const [updated] = await db.update(ordersTable)
    .set({ paymentData, platformFee, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ penggunaId: ordersTable.penggunaId });

  // Notify pengguna of payment details in real-time
  try {
    if (updated) {
      io?.to(`user:${updated.penggunaId}`).emit("order:payment", { orderId, paymentData });
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/done — mitra marks order complete
router.patch("/orders/:id/done", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { totalAmount } = req.body;

  const [updated] = await db.update(ordersTable)
    .set({ status: "done", totalAmount: totalAmount ?? null, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ penggunaId: ordersTable.penggunaId });

  // Notify pengguna order is done + admin
  try {
    if (updated) {
      io?.to(`user:${updated.penggunaId}`).emit("order:done", { orderId, totalAmount });
      io?.to("room:admin").emit("admin:order_update", { type: "done", orderId });
    }
  } catch {}

  res.json({ ok: true });
});

// GET /api/mitra/profile-detail — profil lengkap + dokumen
router.get("/profile-detail", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const [user] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    phone: usersTable.phone, createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, mitraId)).limit(1);
  if (!user) { res.status(404).json({ error: "User tidak ditemukan" }); return; }

  const [app] = await db.select({
    ktpPath: mitraApplicationsTable.ktpPath,
    selfieKtpPath: mitraApplicationsTable.selfieKtpPath,
    simPath: mitraApplicationsTable.simPath,
    certPath: mitraApplicationsTable.certPath,
    operatingCity: mitraApplicationsTable.operatingCity,
    status: mitraApplicationsTable.status,
  }).from(mitraApplicationsTable)
    .where(eq(mitraApplicationsTable.email, user.email))
    .limit(1);

  const totalDone = await db.select({ c: count() }).from(ordersTable)
    .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done")));

  res.json({
    ...user,
    documents: {
      ktp: { uploaded: !!app?.ktpPath, status: app?.status ?? "pending" },
      selfieKtp: { uploaded: !!app?.selfieKtpPath, status: app?.status ?? "pending" },
      sim: { uploaded: !!app?.simPath, status: app?.status ?? "pending" },
      sertifikat: { uploaded: !!app?.certPath, status: app?.status ?? "pending" },
    },
    operatingCity: app?.operatingCity ?? null,
    accountStatus: app?.status ?? "pending",
    totalDoneOrders: totalDone[0]?.c ?? 0,
  });
});

// PUT /api/mitra/change-password
// GET /api/mitra/order-history — full paginated order history
router.get("/order-history", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: ordersTable.id,
      orderNo: ordersTable.orderNo,
      serviceType: ordersTable.serviceType,
      status: ordersTable.status,
      vehicleModel: ordersTable.vehicleModel,
      vehicleYear: ordersTable.vehicleYear,
      pickupAddress: ordersTable.pickupAddress,
      totalAmount: ordersTable.totalAmount,
      platformFee: ordersTable.platformFee,
      rating: ordersTable.rating,
      reviewComment: ordersTable.reviewComment,
      paymentData: ordersTable.paymentData,
      damageCategories: ordersTable.damageCategories,
      penggunaName: usersTable.name,
      createdAt: ordersTable.createdAt,
      cancelReason: ordersTable.cancelReason,
      canceledBy: ordersTable.canceledBy,
    }).from(ordersTable)
      .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
      .where(and(eq(ordersTable.mitraId, mitraId), inArray(ordersTable.status, ["done", "cancelled"])))
      .orderBy(desc(ordersTable.createdAt))
      .limit(parseInt(limit))
      .offset(offset),
    db.select({ total: count() }).from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), inArray(ordersTable.status, ["done", "cancelled"]))),
  ]);

  res.json({ rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/mitra/reviews — ulasan & rating yang diterima mitra
router.get("/reviews", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [rows, [{ total }], [stats]] = await Promise.all([
    db.select({
      id: ordersTable.id,
      orderNo: ordersTable.orderNo,
      serviceType: ordersTable.serviceType,
      rating: ordersTable.rating,
      reviewComment: ordersTable.reviewComment,
      penggunaName: usersTable.name,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable)
      .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"), sql`${ordersTable.rating} IS NOT NULL`))
      .orderBy(desc(ordersTable.createdAt))
      .limit(parseInt(limit))
      .offset(offset),
    db.select({ total: count() }).from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"), sql`${ordersTable.rating} IS NOT NULL`)),
    db.select({ avg: avg(ordersTable.rating), total: count() }).from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"), sql`${ordersTable.rating} IS NOT NULL`)),
  ]);

  res.json({
    rows,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    avgRating: stats?.avg != null ? parseFloat(Number(stats.avg).toFixed(1)) : null,
    totalReviews: stats?.total ?? 0,
  });
});

router.put("/change-password", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "Semua field wajib diisi" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ error: "Password baru minimal 8 karakter" }); return; }
  const [user] = await db.select({ passwordHash: usersTable.passwordHash })
    .from(usersTable).where(eq(usersTable.id, mitraId)).limit(1);
  if (!user) { res.status(404).json({ error: "User tidak ditemukan" }); return; }
  if (user.passwordHash !== hashPassword(currentPassword)) {
    res.status(400).json({ error: "Password lama tidak sesuai" }); return;
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, mitraId));
  res.json({ ok: true });
});

// POST /api/mitra/upload-photo — upload foto profil mitra
router.post("/upload-photo", (req, res, next) => {
  uploadProfilePhoto.single("photo")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const mitraId = getMitraId(req);
  if (!mitraId) { res.status(401).json({ error: "Belum login" }); return; }
  if (!req.file) { res.status(400).json({ error: "Tidak ada file yang diunggah" }); return; }
  const relativePath = `/uploads/profile/${req.file.filename}`;
  await db.update(usersTable).set({ profilePhotoPath: relativePath }).where(eq(usersTable.id, mitraId as number));
  res.json({ ok: true, photoUrl: relativePath });
});

// POST /api/mitra/reports — kirim laporan dari mitra
router.post("/reports", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const { type, title, message, orderId, orderNo } = req.body as { type?: string; title: string; message: string; orderId?: number; orderNo?: string };
  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Judul dan isi laporan wajib diisi" }); return;
  }
  const [inserted] = await db.insert(reportsTable).values({
    userId: mitraId,
    orderId: orderId ?? null,
    orderNo: orderNo ?? null,
    type: type ?? "order",
    title: title.trim(),
    message: message.trim(),
    status: "open",
  }).returning();
  res.json({ ok: true, report: inserted });
});

export default router;
