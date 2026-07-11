import { Router } from "express";
import multer from "multer";
import { db, mitraApplicationsTable, mitraLocationsTable, usersTable, ordersTable, reportsTable, systemSettingsTable, platformFeePaymentsTable, chatMessagesTable, loginHistoryTable } from "@workspace/db";
import { uploadBufferToCloudinary } from "../lib/cloudinary";
import { normalizePhone, isValidPhone, isPhoneRegistered } from "../lib/phone";
import { eq, and, or, gt, gte, desc, asc, sql, avg, count, sum, inArray } from "drizzle-orm";
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
  // Mobil (gocar): tarif flat nasional, biaya awal + per km sejak km 0.
  gocar:      { base: 5000,  freeKm: 0, perKm: 4500 },
};
// Verticals whose fare is based on trip distance (pickup→destination) with no free km.
const TRIP_SERVICES = new Set(["goride", "gocar", "gosend", "goshop", "gofood"]);
function isTripService(serviceType: string): boolean {
  return TRIP_SERVICES.has(serviceType.toLowerCase().replace(/[\s_-]+/g, ""));
}

// Kurir motor (goride/gosend/goshop/gofood): tarif per ZONA, minimum menutup MOTOR_FREE_KM pertama.
const MOTOR_TRIP_SERVICES = new Set(["goride", "gosend", "goshop", "gofood"]);
function isMotorTripService(serviceType: string): boolean {
  return MOTOR_TRIP_SERVICES.has(serviceType.toLowerCase().replace(/[\s_-]+/g, ""));
}
const MOTOR_ZONE_DEFAULT: Record<number, { base: number; perKm: number }> = {
  1: { base: 9000,  perKm: 1500 },
  2: { base: 10000, perKm: 2000 },
  3: { base: 9000,  perKm: 2000 },
};
// Tentukan zona tarif dari koordinat titik jemput (batas geografis Indonesia, konstanta).
// Mirror artifacts/ride-splash/src/utils/pricing.ts → zoneFromCoords. Keep in sync.
function zoneFromCoords(lat?: number | null, lng?: number | null): number {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return 3;
  if (lat >= -6.9 && lat <= -5.9 && lng >= 106.3 && lng <= 107.2) return 2; // Jabodetabek
  if (lat >= -8.95 && lat <= -8.0 && lng >= 114.4 && lng <= 115.8) return 1; // Bali
  if (lat >= -8.9 && lat <= -5.8 && lng >= 105.0 && lng <= 114.6) return 1; // Jawa
  if (lng >= 95.0 && lng <= 106.1 && lat >= -6.2 && lat <= 6.5) return 1; // Sumatra
  return 3;
}

// Ojol umbrella: satu mitra motor melayani antar penumpang + kirim + belanja + makan.
const OJOL_ORDER_TYPES = ["goride", "gosend", "goshop", "gofood"];
const OJOL_CAPABLE_MITRA = ["ojol", "goride", "gosend", "goshop", "gofood"];
function normSvc(s: string): string { return s.toLowerCase().replace(/[\s_-]+/g, ""); }
function isOjolCapableMitra(s: string): boolean { return OJOL_CAPABLE_MITRA.includes(normSvc(s)); }
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
// Radius maksimal (km) antara lokasi mitra dan titik jemput order. Mengunci order ke
// wilayahnya: mitra di luar radius tidak bisa melihat/menerima order tersebut.
// Harus sama dengan ORDER_RADIUS_KM di routes/pengguna.ts.
const ORDER_RADIUS_KM = 25;

// Faktor "belok-belokan" jalan. Jaring pengaman saat OSRM gagal — supaya fee driver tidak
// pernah memakai garis lurus mentah (lebih pendek dari jalan → merugikan driver).
const ROAD_DETOUR_FACTOR = 1.4;

// Jarak mengikuti jalan (OSRM), dengan sekali percobaan ulang. Bila OSRM tetap gagal, pakai
// estimasi jalan (garis lurus × faktor belok), TIDAK PERNAH garis lurus mentah.
async function serverRoadDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number, log?: any): Promise<number> {
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.ok) {
        const data: any = await res.json();
        const meters = data?.routes?.[0]?.distance;
        if (typeof meters === "number" && meters > 0) return meters / 1000;
      }
    } catch (err) {
      if (attempt === 1) log?.warn?.({ err }, "OSRM gagal setelah retry — pakai estimasi jalan (garis lurus × faktor belok)");
    } finally {
      clearTimeout(timer);
    }
  }
  return serverHaversineKm(lat1, lng1, lat2, lng2) * ROAD_DETOUR_FACTOR;
}

// Semua upload pakai memory storage dan dikirim ke Cloudinary
const memStorage = multer.memoryStorage();
const uploadProofPhoto = multer({ storage: memStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true); else cb(new Error("Hanya file gambar yang diperbolehkan"));
}});
const uploadFeeProof = multer({ storage: memStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true); else cb(new Error("Hanya file gambar yang diperbolehkan"));
}});
const upload = multer({
  storage: memStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format file tidak didukung"));
  },
});
const uploadProfilePhoto = multer({
  storage: memStorage,
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
  const { name, email, password, serviceType, operatingCity } = req.body;
  const phone = normalizePhone(req.body.phone ?? "");

  if (!name || !req.body.phone || !email || !password || !serviceType || !operatingCity) {
    res.status(400).json({ error: "Semua field wajib diisi" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter" });
    return;
  }

  if (!isValidPhone(phone)) {
    res.status(400).json({ error: "Nomor HP tidak valid. Contoh: 0812xxxxxxx" });
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

  if (await isPhoneRegistered(phone)) {
    res.status(409).json({ error: "Nomor HP sudah terdaftar. Satu nomor hanya untuk satu akun." });
    return;
  }

  const files = req.files as Record<string, Express.Multer.File[]>;

  // Upload dokumen ke Cloudinary
  const uploadDoc = async (field: string, folder: string): Promise<string | null> => {
    const file = files?.[field]?.[0];
    if (!file) return null;
    try { return await uploadBufferToCloudinary(file.buffer, { folder }); }
    catch (err) { console.error(`Gagal upload ${field}:`, err); return null; }
  };
  const [ktpUrl, selfieKtpUrl, simUrl, certUrl] = await Promise.all([
    uploadDoc("ktp", "ride/mitra-docs"),
    uploadDoc("selfieKtp", "ride/mitra-docs"),
    uploadDoc("sim", "ride/mitra-docs"),
    uploadDoc("cert", "ride/mitra-docs"),
  ]);

  const [application] = await db.insert(mitraApplicationsTable).values({
    name,
    phone,
    email,
    passwordHash: hashPassword(password),
    serviceType,
    ktpPath: ktpUrl,
    selfieKtpPath: selfieKtpUrl,
    simPath: simUrl,
    certPath: certUrl,
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

/** Read mitra userId from session mitraId key */
function getMitraId(req: any): number | null {
  const fromSession = req.session?.mitraId;
  if (fromSession) return fromSession as number;
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
  const [userRow] = await db.select({ name: usersTable.name, email: usersTable.email, profilePhotoPath: usersTable.profilePhotoPath, isSuspended: usersTable.isSuspended })
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

  // Platform fee — total dari semua orders done dikurangi total verified payments
  const [[allFeeRow], [verifiedRow], oldestWeekRows] = await Promise.all([
    db.select({ fee: sum(ordersTable.platformFee) })
      .from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"))),
    db.select({ total: sum(platformFeePaymentsTable.amountVerified) })
      .from(platformFeePaymentsTable)
      .where(and(eq(platformFeePaymentsTable.mitraId, mitraId), eq(platformFeePaymentsTable.status, "verified"))),
    db.select({
      weekEndEpoch: sql<string>`extract(epoch from date_trunc('week', min(${ordersTable.createdAt})) + interval '6 days')`,
    }).from(ordersTable).where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"))),
  ]);

  const totalAllFees = Number(allFeeRow?.fee ?? 0);
  const totalVerified = Number(verifiedRow?.total ?? 0);
  const platformFeePending = Math.max(0, totalAllFees - totalVerified);
  const platformFeeStatus = platformFeePending > 0 ? "belum_lunas" : "lunas";

  // Hitung deadline & auto-suspend
  let daysUntilSuspend: number | null = null;
  const oldestEpoch = Number(oldestWeekRows[0]?.weekEndEpoch ?? 0);
  if (oldestEpoch > 0 && platformFeePending > 0) {
    const deadlineMs = oldestEpoch * 1000 + 7 * 24 * 60 * 60 * 1000;
    daysUntilSuspend = Math.ceil((deadlineMs - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysUntilSuspend < 0 && !userRow?.isSuspended) {
      await db.update(usersTable).set({ isSuspended: true }).where(eq(usersTable.id, mitraId));
    }
  }

  const ratingValue = ratingRow?.rating != null ? parseFloat(Number(ratingRow.rating).toFixed(1)) : null;

  res.json({
    name: userRow?.name ?? "",
    profilePhotoPath: userRow?.profilePhotoPath ?? null,
    serviceType,
    isOnline: locRow?.isOnline ?? false,
    todayIncome: Number(todayStats?.income) || 0,
    todayOrders: Number(todayStats?.orders) || 0,
    rating: ratingValue,
    platformFeeStatus,
    platformFeePending,
    daysUntilSuspend,
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
    .select({ penggunaId: ordersTable.penggunaId, orderId: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      inArray(ordersTable.status, ["accepted", "menuju", "tiba", "pengerjaan"])
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

  // Jika mitra sedang ada order aktif, tidak perlu tampilkan order baru
  const [busyOrder] = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      inArray(ordersTable.status, ["accepted", "menuju", "tiba", "pengerjaan"])
    ))
    .limit(1);
  if (busyOrder) { res.json({ incoming: null }); return; }

  const [locRow] = await db.select({ serviceType: mitraLocationsTable.serviceType, isOnline: mitraLocationsTable.isOnline, lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng })
    .from(mitraLocationsTable)
    .where(eq(mitraLocationsTable.userId, mitraId))
    .limit(1);

  // Jika mitra offline, tidak tampilkan order baru
  if (!locRow?.isOnline) { res.json({ incoming: null }); return; }

  // Show pending orders that match mitra's serviceType and are unassigned (mitraId IS NULL).
  // Ojol mitra (payung motor) melihat SEMUA order grup: goride/gosend/goshop/gofood.
  // If no serviceType, fall back to all unassigned pending orders.
  // Kunci wilayah di level query (bukan setelah limit) agar order terdekat tidak
  // tersembunyi oleh order jauh yang lebih baru. Hanya order yang titik jemputnya
  // dalam ORDER_RADIUS_KM dari lokasi mitra. Order tanpa koordinat tetap tampil
  // (fail-open) — konsisten dengan dispatch & accept.
  const radiusClause = (locRow.lat != null && locRow.lng != null)
    ? sql`(${ordersTable.pickupLat} IS NULL OR ${ordersTable.pickupLng} IS NULL OR (6371 * 2 * asin(sqrt(power(sin(radians(${ordersTable.pickupLat} - ${locRow.lat}) / 2), 2) + cos(radians(${locRow.lat})) * cos(radians(${ordersTable.pickupLat})) * power(sin(radians(${ordersTable.pickupLng} - ${locRow.lng}) / 2), 2)))) <= ${ORDER_RADIUS_KM})`
    : sql`true`;

  const whereClause = locRow?.serviceType
    ? and(
        eq(ordersTable.status, "pending"),
        sql`${ordersTable.mitraId} IS NULL`,
        isOjolCapableMitra(locRow.serviceType)
          ? inArray(ordersTable.serviceType, OJOL_ORDER_TYPES)
          : eq(ordersTable.serviceType, locRow.serviceType),
        radiusClause,
      )
    : and(
        eq(ordersTable.status, "pending"),
        sql`${ordersTable.mitraId} IS NULL`,
        radiusClause,
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
    destLat: ordersTable.destLat,
    destLng: ordersTable.destLng,
    destAddress: ordersTable.destAddress,
    tripDistanceKm: ordersTable.tripDistanceKm,
    recipientName: ordersTable.recipientName,
    recipientPhone: ordersTable.recipientPhone,
    itemNote: ordersTable.itemNote,
    orderItems: ordersTable.orderItems,
    totalAmount: ordersTable.totalAmount,
    platformFee: ordersTable.platformFee,
    penggunaName: usersTable.name,
    penggunaProfilePhoto: usersTable.profilePhotoPath,
    penggunaPhotoPath: ordersTable.penggunaPhotoPath,
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
    paymentConfirmedAt: ordersTable.paymentConfirmedAt,
    paymentData: ordersTable.paymentData,
    merchantStatus: ordersTable.merchantStatus,
    foodTotal: ordersTable.foodTotal,
    penggunaName: usersTable.name,
    penggunaProfilePhoto: usersTable.profilePhotoPath,
    penggunaPhotoPath: ordersTable.penggunaPhotoPath,
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

  // Cegah double order: blokir jika mitra sudah punya order aktif
  const [existingActive] = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      inArray(ordersTable.status, ["accepted", "menuju", "tiba", "pengerjaan"])
    ))
    .limit(1);
  if (existingActive) {
    res.status(409).json({ error: "Kamu masih punya order aktif. Selesaikan terlebih dahulu sebelum menerima order baru." });
    return;
  }

  // Server-side capability guard: mitra hanya boleh menerima order yang sesuai layanannya.
  // Mencocokkan matrix yang sama dengan daftar order masuk (mitra ojol payung = 4 layanan;
  // gocar & layanan on-site = exact match). Mencegah bypass via panggilan API langsung.
  const [orderRow] = await db.select({ serviceType: ordersTable.serviceType, pickupLat: ordersTable.pickupLat, pickupLng: ordersTable.pickupLng })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
    .limit(1);
  if (!orderRow) {
    res.status(404).json({ error: "Order tidak ditemukan atau sudah diambil mitra lain." });
    return;
  }
  // Resolve the mitra's REGISTERED service type (yang didaftarkan saat pendaftaran mitra):
  // mitra_locations dulu (disalin dari aplikasi saat go-online), fallback ke mitra_applications.
  let mitraSvc: string | null = null;
  const [mLocSvc] = await db.select({ serviceType: mitraLocationsTable.serviceType, lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng })
    .from(mitraLocationsTable)
    .where(eq(mitraLocationsTable.userId, mitraId))
    .limit(1);
  mitraSvc = mLocSvc?.serviceType ?? null;
  if (!mitraSvc) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, mitraId)).limit(1);
    if (u?.email) {
      const [appRow] = await db.select({ serviceType: mitraApplicationsTable.serviceType })
        .from(mitraApplicationsTable)
        .where(eq(mitraApplicationsTable.email, u.email))
        .limit(1);
      mitraSvc = appRow?.serviceType ?? null;
    }
  }
  // Enforce: mitra HANYA boleh menerima order sesuai layanan yang didaftarkan.
  // Cocok persis, ATAU payung ojol (mitra ojol → 4 tipe order ojol). Selain itu → 403.
  // Contoh yang ditolak: mitra ojol ambil order gocar; mitra towing ambil order ojol.
  const orderSvc = normSvc(orderRow.serviceType);
  const allowed = !!mitraSvc && (
    normSvc(mitraSvc) === orderSvc
    || (isOjolCapableMitra(mitraSvc) && OJOL_ORDER_TYPES.includes(orderSvc))
  );
  if (!allowed) {
    req.log.warn({ mitraId, mitraServiceType: mitraSvc, orderId, orderServiceType: orderRow.serviceType }, "tolak terima order: layanan tidak sesuai pendaftaran mitra");
    res.status(403).json({ error: "Layanan order ini tidak sesuai dengan layanan yang Anda daftarkan." });
    return;
  }

  // Kunci wilayah: mitra hanya boleh menerima order dalam radius dari titik jemput.
  // Menutup bypass via panggilan API langsung (mitra luar kota tidak bisa ambil order).
  // Jika koordinat tidak lengkap, lewati cek (fallback ke perilaku lama).
  if (mLocSvc?.lat != null && mLocSvc?.lng != null && orderRow.pickupLat != null && orderRow.pickupLng != null) {
    const distKm = serverHaversineKm(mLocSvc.lat, mLocSvc.lng, orderRow.pickupLat, orderRow.pickupLng);
    if (distKm > ORDER_RADIUS_KM) {
      req.log.warn({ mitraId, orderId, distKm }, "tolak terima order: di luar radius wilayah mitra");
      res.status(403).json({ error: "Order ini berada di luar area layanan Anda (terlalu jauh dari titik jemput)." });
      return;
    }
  }

  // Assign mitraId + set accepted.
  // ATOMIC anti-double-order: hanya berhasil jika (a) order masih pending DAN (b) mitra ini
  // belum punya order aktif apa pun (lintas SEMUA layanan — mitra ojol yang menerima ojek
  // otomatis tidak bisa menerima kirim/belanja/makan). Kondisi NOT EXISTS di level DB menutup
  // race-condition dua "terima" bersamaan yang bisa lolos dari cek SELECT di atas.
  const [updated] = await db.update(ordersTable)
    .set({ status: "accepted", mitraId, updatedAt: new Date() })
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.status, "pending"),
      sql`NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.mitra_id = ${mitraId} AND o2.status IN ('accepted','menuju','tiba','pengerjaan'))`,
    ))
    .returning({
      penggunaId: ordersTable.penggunaId,
      orderNo: ordersTable.orderNo,
      serviceType: ordersTable.serviceType,
      pickupLat: ordersTable.pickupLat,
      pickupLng: ordersTable.pickupLng,
      destLat: ordersTable.destLat,
      destLng: ordersTable.destLng,
      tripDistanceKm: ordersTable.tripDistanceKm,
    });

  // Update tidak mengenai baris apa pun → order sudah diambil mitra lain, atau mitra ini
  // baru saja menerima order lain (race). Jangan balas sukses palsu.
  if (!updated) {
    res.status(409).json({ error: "Order sudah diambil mitra lain atau kamu masih punya order aktif." });
    return;
  }

  try {
    if (updated) {
      const [mitraUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, mitraId)).limit(1);
      const [mitraLoc] = await db.select({ lat: mitraLocationsTable.lat, lng: mitraLocationsTable.lng })
        .from(mitraLocationsTable).where(eq(mitraLocationsTable.userId, mitraId)).limit(1);

      // Calculate & store callFee at acceptance time — baca tarif dari DB
      const settingsRows = await db.select().from(systemSettingsTable);
      const sMap: Record<string, string> = {};
      settingsRows.forEach(r => { sMap[r.key] = r.value; });
      const svcKey = updated.serviceType.toLowerCase().replace(/[\s_-]+/g, "");
      const trip = isTripService(svcKey);
      const motorTrip = isMotorTripService(svcKey);
      const biayaLayananDB = parseInt(sMap["biaya_layanan_admin"] ?? "2000") || 2000;

      // Zona tarif berdasarkan titik jemput (hanya relevan untuk kurir motor).
      const zone = zoneFromCoords(updated.pickupLat, updated.pickupLng);

      let base: number, perKm: number, freeKm: number;
      if (motorTrip) {
        // Kurir motor (goride/gosend/goshop/gofood): tarif per zona, minimum menutup motor_free_km pertama.
        base = parseInt(sMap[`motor_zone${zone}_base`] ?? "") || MOTOR_ZONE_DEFAULT[zone].base;
        perKm = parseInt(sMap[`motor_zone${zone}_per_km`] ?? "") || MOTOR_ZONE_DEFAULT[zone].perKm;
        freeKm = parseFloat(sMap["motor_free_km"] ?? "4") || 4;
      } else {
        // gocar (mobil) charge from km 0; jasa panggilan on-site grant free km.
        freeKm = trip ? 0 : (parseFloat(sMap["call_fee_free_km"] ?? "3") || 3);
        base = parseInt(sMap[`call_fee_${svcKey}_base`] ?? "") || (CALL_FEE_CONFIG[svcKey]?.base ?? 12000);
        perKm = parseInt(sMap[`call_fee_${svcKey}_per_km`] ?? "") || (CALL_FEE_CONFIG[svcKey]?.perKm ?? 2500);
      }

      let distKm = 0;
      if (trip) {
        // Fare over the passenger/parcel trip distance (pickup → destination), mengikuti jalan (OSRM).
        if (updated.tripDistanceKm != null && updated.tripDistanceKm > 0) {
          distKm = updated.tripDistanceKm;
        } else if (updated.pickupLat != null && updated.pickupLng != null && updated.destLat != null && updated.destLng != null) {
          distKm = await serverRoadDistanceKm(updated.pickupLat, updated.pickupLng, updated.destLat, updated.destLng, req.log);
        }
      } else if (mitraLoc && updated.pickupLat != null && updated.pickupLng != null) {
        // On-site services: fee over how far the mitra travels to the user, mengikuti jalan (OSRM).
        distKm = await serverRoadDistanceKm(mitraLoc.lat, mitraLoc.lng, updated.pickupLat, updated.pickupLng, req.log);
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
      }, "pesanan");
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/reject
router.patch("/orders/:id/reject", requireMitra, async (req, res) => {
  const orderId = parseInt(req.params.id);

  // Keep status as "pending" so other mitras can still accept the order
  const [order] = await db.select({ penggunaId: ordersTable.penggunaId })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
    .limit(1);

  if (order) {
    try {
      // Emit order:rejected so pengguna stays in searching state (not cancelled)
      io?.to(`user:${order.penggunaId}`).emit("order:rejected", { orderId });
      sendPushToUsers([order.penggunaId], {
        title: "⚠️ Mitra Tidak Tersedia",
        body: "Mitra menolak pesanan Anda. Pesanan akan dicari ke mitra lain.",
        url: "/",
      }, "pesanan");
    } catch {}
  }

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/cancel — mitra membatalkan order yang sudah diterima
router.patch("/orders/:id/cancel", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { cancelReason } = (req.body ?? {}) as { cancelReason?: string };

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
      }, "pesanan");
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

  // Gate: pengguna harus sudah konfirmasi (PATCH /pengguna/orders/:id/confirm)
  // sebelum mitra boleh mulai bergerak/menjalankan fase.
  const [cur] = await db.select({
    penggunaConfirmed: ordersTable.penggunaConfirmed,
    serviceType: ordersTable.serviceType,
    merchantStatus: ordersTable.merchantStatus,
  })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .limit(1);
  if (!cur) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (!cur.penggunaConfirmed) {
    res.status(409).json({ error: "Menunggu konsumen mengonfirmasi sebelum melanjutkan." }); return;
  }
  // GoFood: ojol tidak boleh mulai mengantar (fase pengerjaan) sebelum makanan siap dari warung.
  if (normSvc(cur.serviceType) === "gofood" && phase === "pengerjaan" && cur.merchantStatus !== "siap") {
    res.status(409).json({ error: "Menunggu warung menyelesaikan pesanan (makanan siap)." }); return;
  }

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
        sendPushToUsers([updated.penggunaId], { ...phaseMessages[phase], url: "/" }, "pesanan");
      }
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/payment-data — kirim rincian biaya ke pengguna
router.patch("/orders/:id/payment-data", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  // Hanya biayaJasa, biayaSparepart, dan paymentMethod yang sah berasal dari mitra.
  // biayaPanggilan & biayaLayanan TIDAK dipercaya dari client — keduanya dihitung
  // server (anti manipulasi platform fee / tagihan pengguna).
  const { biayaJasa, biayaSparepart, paymentMethod } = req.body;

  // Ambil call fee otoritatif yang sudah dihitung & disimpan server saat accept,
  // beserta status untuk pengecekan edit ulang.
  const [existing] = await db.select({
    paymentData: ordersTable.paymentData,
    status: ordersTable.status,
    totalAmount: ordersTable.totalAmount,
    serviceType: ordersTable.serviceType,
    foodTotal: ordersTable.foodTotal,
  })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (existing.paymentData != null) {
    res.status(409).json({ error: "Rincian biaya sudah dikirim ke konsumen dan tidak dapat diubah lagi" });
    return;
  }

  // Baca tarif otoritatif dari DB (platform fee % + biaya layanan & admin).
  const svcNorm = normSvc(existing.serviceType);
  const trip = isTripService(svcNorm);
  // Layanan trip (motor/mobil/kurir) potongan lebih kecil dari jasa panggilan on-site.
  const feePctKey = trip ? "platform_fee_pct_trip" : "platform_fee_pct";
  const [feePctRow] = await db.select({ value: systemSettingsTable.value })
    .from(systemSettingsTable).where(eq(systemSettingsTable.key, feePctKey)).limit(1);
  const [layananRow] = await db.select({ value: systemSettingsTable.value })
    .from(systemSettingsTable).where(eq(systemSettingsTable.key, "biaya_layanan_admin")).limit(1);
  const feePct = (parseFloat(feePctRow?.value ?? (trip ? "5" : "15")) || (trip ? 5 : 15)) / 100;

  // Nilai otoritatif server — bukan dari body request mitra.
  const callFee = Number(existing.totalAmount) || 0;            // biaya panggilan (ongkir) dari accept
  const layanan = parseInt(layananRow?.value ?? "2000") || 2000; // biaya layanan & admin dari DB
  const isGofood = svcNorm === "gofood";
  // GoFood: ojol menalangi harga makanan (foodTotal, otoritatif dari saat order dibuat),
  // ditagihkan ke pengguna sebagai "biayaSparepart"; tidak ada biaya jasa.
  const jasa = isGofood ? 0 : Math.max(0, Number(biayaJasa) || 0);
  const sparepart = isGofood
    ? (Number(existing.foodTotal) || 0)
    : Math.max(0, Number(biayaSparepart) || 0);

  // Belanja (goshop): batasi talangan mitra agar tidak melebihi batas maksimal (dari DB).
  if (svcNorm === "goshop") {
    const [maxRow] = await db.select({ value: systemSettingsTable.value })
      .from(systemSettingsTable).where(eq(systemSettingsTable.key, "belanja_max_talangan")).limit(1);
    const maxTalangan = parseInt(maxRow?.value ?? "500000") || 500000;
    if (sparepart > maxTalangan) {
      res.status(400).json({ error: `Total belanja melebihi batas talangan Rp${maxTalangan.toLocaleString("id-ID")}.` });
      return;
    }
  }

  const total = jasa + sparepart + callFee + layanan;
  const platformFee = Math.round(callFee * feePct) + layanan;

  const paymentData = {
    biayaJasa: jasa,
    biayaSparepart: sparepart,
    biayaPanggilan: callFee,
    biayaLayanan: layanan,
    total,
    paymentMethod,
  };

  const [updated] = await db.update(ordersTable)
    .set({ paymentData, platformFee, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ penggunaId: ordersTable.penggunaId });

  // Notify pengguna of payment details in real-time
  try {
    if (updated) {
      io?.to(`user:${updated.penggunaId}`).emit("order:payment", { orderId, paymentData });
      sendPushToUsers([updated.penggunaId], {
        title: "💳 Rincian Biaya Dikirim",
        body: "Mitra mengirim rincian biaya layanan. Cek dan konfirmasi pembayaran.",
        url: "/",
      }, "pesanan");
    }
  } catch {}

  res.json({ ok: true });
});

// PATCH /api/mitra/orders/:id/proof-photo — upload foto bukti kerja mitra (hanya untuk admin)
router.patch("/orders/:id/proof-photo", requireMitra, (req, res, next) => {
  uploadProofPhoto.single("photo")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  if (!req.file) { res.status(400).json({ error: "Tidak ada file" }); return; }

  let photoUrl: string;
  try {
    photoUrl = await uploadBufferToCloudinary(req.file.buffer, { folder: "ride/proof-photos" });
  } catch (err) {
    console.error("Gagal upload foto bukti ke Cloudinary:", err);
    res.status(500).json({ error: "Gagal upload foto, coba lagi" }); return;
  }

  const [updated] = await db.update(ordersTable)
    .set({ mitraProofPhotoPath: photoUrl, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ id: ordersTable.id });

  if (!updated) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  res.json({ ok: true, photoUrl });
});

// PATCH /api/mitra/orders/:id/done — mitra marks order complete
router.patch("/orders/:id/done", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.id);
  const { totalAmount } = req.body;

  // Gate: konsumen harus sudah mengonfirmasi pembayaran sebelum order ditandai selesai.
  const [cur] = await db.select({ paymentConfirmedAt: ordersTable.paymentConfirmedAt })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .limit(1);
  if (!cur) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (!cur.paymentConfirmedAt) {
    res.status(409).json({ error: "Konsumen belum mengonfirmasi pembayaran." }); return;
  }

  // Hanya overwrite totalAmount jika dikirim — jangan menghapus nilai yang sudah ada.
  const doneSet: Record<string, unknown> = { status: "done", updatedAt: new Date() };
  if (totalAmount != null) doneSet.totalAmount = totalAmount;

  const [updated] = await db.update(ordersTable)
    .set(doneSet)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.mitraId, mitraId)))
    .returning({ penggunaId: ordersTable.penggunaId });

  // Notify pengguna order is done + admin
  try {
    if (updated) {
      io?.to(`user:${updated.penggunaId}`).emit("order:done", { orderId, totalAmount });
      io?.to("room:admin").emit("admin:order_update", { type: "done", orderId });
      sendPushToUsers([updated.penggunaId], {
        title: "✅ Pekerjaan Selesai!",
        body: "Mitra telah menyelesaikan pekerjaan. Berikan ulasan Anda!",
        url: "/",
      }, "pesanan");
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

// GET /api/mitra/login-history — riwayat login mitra (perangkat + waktu)
router.get("/login-history", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const rows = await db.select({
    id: loginHistoryTable.id,
    ipAddress: loginHistoryTable.ipAddress,
    userAgent: loginHistoryTable.userAgent,
    createdAt: loginHistoryTable.createdAt,
  }).from(loginHistoryTable)
    .where(and(eq(loginHistoryTable.userId, mitraId), eq(loginHistoryTable.role, "mitra")))
    .orderBy(desc(loginHistoryTable.createdAt))
    .limit(20);
  res.json({ history: rows });
});

// GET /api/mitra/chat-history — daftar percakapan (per order) milik mitra
router.get("/chat-history", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const rows = await db.select({
    orderId: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    status: ordersTable.status,
    penggunaName: usersTable.name,
    lastMessage: sql<string | null>`(select cm.message from chat_messages cm where cm.order_id = ${ordersTable.id} order by cm.created_at desc limit 1)`,
    lastAt: sql<string | null>`(select cm.created_at from chat_messages cm where cm.order_id = ${ordersTable.id} order by cm.created_at desc limit 1)`,
  }).from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.penggunaId, usersTable.id))
    .where(and(
      eq(ordersTable.mitraId, mitraId),
      sql`exists (select 1 from chat_messages cm where cm.order_id = ${ordersTable.id})`,
    ))
    .orderBy(desc(sql`(select cm.created_at from chat_messages cm where cm.order_id = ${ordersTable.id} order by cm.created_at desc limit 1)`))
    .limit(30);
  res.json({ conversations: rows });
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
  let photoUrl: string;
  try {
    photoUrl = await uploadBufferToCloudinary(req.file.buffer, { folder: "ride/profile" });
  } catch (err) {
    console.error("Gagal upload foto profil mitra ke Cloudinary:", err);
    res.status(500).json({ error: "Gagal upload foto, coba lagi" }); return;
  }
  await db.update(usersTable).set({ profilePhotoPath: photoUrl }).where(eq(usersTable.id, mitraId as number));
  res.json({ ok: true, photoUrl });
});

// GET /api/mitra/platform-fee/detail — detail fee, riwayat bayar, dan mingguan
router.get("/platform-fee/detail", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;

  const [weeklyRaw, allFeeRow, payments] = await Promise.all([
    db.select({
      weekStart: sql<string>`to_char(date_trunc('week', ${ordersTable.createdAt}), 'DD Mon YYYY')`,
      weekEnd: sql<string>`to_char(date_trunc('week', ${ordersTable.createdAt}) + interval '6 days', 'DD Mon YYYY')`,
      weekEndEpoch: sql<string>`extract(epoch from date_trunc('week', ${ordersTable.createdAt}) + interval '6 days')`,
      omset: sum(ordersTable.totalAmount),
      fee: sum(ordersTable.platformFee),
      orderCount: count(),
    }).from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done")))
      .groupBy(sql`date_trunc('week', ${ordersTable.createdAt})`)
      .orderBy(desc(sql`date_trunc('week', ${ordersTable.createdAt})`))
      .limit(16),
    db.select({ fee: sum(ordersTable.platformFee) })
      .from(ordersTable)
      .where(and(eq(ordersTable.mitraId, mitraId), eq(ordersTable.status, "done"))),
    db.select().from(platformFeePaymentsTable)
      .where(eq(platformFeePaymentsTable.mitraId, mitraId))
      .orderBy(desc(platformFeePaymentsTable.createdAt))
      .limit(30),
  ]);

  const totalAllFees = Number(allFeeRow[0]?.fee ?? 0);
  const totalVerified = payments.filter(p => p.status === "verified").reduce((s, p) => s + (p.amountVerified ?? 0), 0);
  const totalPending = Math.max(0, totalAllFees - totalVerified);

  let daysUntilSuspend: number | null = null;
  let suspendDeadline: string | null = null;
  if (weeklyRaw.length > 0 && totalPending > 0) {
    const oldest = weeklyRaw[weeklyRaw.length - 1];
    const deadlineMs = Number(oldest.weekEndEpoch) * 1000 + 7 * 24 * 60 * 60 * 1000;
    daysUntilSuspend = Math.ceil((deadlineMs - Date.now()) / (24 * 60 * 60 * 1000));
    suspendDeadline = new Date(deadlineMs).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }

  const weeks = weeklyRaw.map(f => ({
    weekStart: f.weekStart,
    weekEnd: f.weekEnd,
    fee: Number(f.fee ?? 0),
    omset: Number(f.omset ?? 0),
    orderCount: Number(f.orderCount ?? 0),
    deadline: new Date(Number(f.weekEndEpoch) * 1000 + 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
  }));

  res.json({
    totalAllFees,
    totalVerified,
    totalPending,
    weeks,
    payments: payments.map(p => ({
      id: p.id,
      amountClaimed: p.amountClaimed,
      amountVerified: p.amountVerified,
      status: p.status,
      notes: p.notes,
      proofPhotoPath: p.proofPhotoPath,
      createdAt: p.createdAt,
      verifiedAt: p.verifiedAt,
    })),
    suspendDeadline,
    daysUntilSuspend,
  });
});

// POST /api/mitra/platform-fee/pay — kirim bukti pembayaran platform fee
router.post("/platform-fee/pay", (req, res, next) => {
  uploadFeeProof.single("foto")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, requireMitra, async (req: any, res) => {
  const mitraId = getMitraId(req) as number;
  const amountClaimed = parseInt(req.body.amountClaimed);
  if (!req.file || isNaN(amountClaimed) || amountClaimed <= 0) {
    res.status(400).json({ error: "Foto bukti dan jumlah pembayaran diperlukan" });
    return;
  }
  let proofPhotoPath: string;
  try {
    proofPhotoPath = await uploadBufferToCloudinary(req.file.buffer, { folder: "ride/fee-proofs" });
  } catch (err) {
    console.error("Gagal upload bukti fee ke Cloudinary:", err);
    res.status(500).json({ error: "Gagal upload foto bukti, coba lagi" }); return;
  }
  const [payment] = await db.insert(platformFeePaymentsTable)
    .values({ mitraId, amountClaimed, proofPhotoPath, status: "pending" })
    .returning();
  res.json({ ok: true, payment });
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

// POST /api/mitra/chat/:orderId — send chat as MITRA (session-enforced, no ambiguity)
router.post("/chat/:orderId", requireMitra, async (req, res) => {
  const mitraId = getMitraId(req) as number;
  const orderId = parseInt(req.params.orderId);
  const { message } = req.body;
  if (isNaN(orderId) || !message?.trim()) { res.status(400).json({ error: "Data tidak valid" }); return; }

  const [order] = await db.select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order || order.mitraId !== mitraId) { res.status(403).json({ error: "Akses ditolak" }); return; }

  const [msg] = await db.insert(chatMessagesTable).values({
    orderId, senderId: mitraId, senderRole: "mitra", message: message.trim(),
  }).returning({ id: chatMessagesTable.id, createdAt: chatMessagesTable.createdAt });

  try {
    io?.to(`order:${orderId}`).emit("chat:message", {
      id: msg.id, orderId, senderId: mitraId, senderRole: "mitra",
      message: message.trim(), createdAt: msg.createdAt,
    });
    if (order.penggunaId) {
      sendPushToUsers([order.penggunaId], { title: "💬 Pesan dari Mitra", body: message.trim().slice(0, 80), url: "/" }, "chat");
    }
  } catch {}
  res.json({ ok: true, messageId: msg.id, senderRole: "mitra" });
});

export default router;
