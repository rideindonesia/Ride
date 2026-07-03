import { Router } from "express";
import multer from "multer";
import {
  db,
  merchantApplicationsTable,
  merchantsTable,
  menuItemsTable,
  ordersTable,
  usersTable,
} from "@workspace/db";
import { uploadBufferToCloudinary } from "../lib/cloudinary";
import { eq, and, or, desc, asc, inArray, sql, count, sum } from "drizzle-orm";
import crypto from "crypto";
import { io } from "../socket";
import { sendPushToUsers } from "./push";

const router = Router();

const memStorage = multer.memoryStorage();
const uploadImage = multer({
  storage: memStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Hanya file gambar yang diperbolehkan"));
  },
});
const applyUpload = uploadImage.fields([
  { name: "ktp", maxCount: 1 },
  { name: "shopPhoto", maxCount: 1 },
]);

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

/** Owner user id stored in session by /api/auth/login (role merchant). */
function getMerchantOwnerId(req: any): number | null {
  const fromSession = req.session?.merchantId;
  return fromSession ? (fromSession as number) : null;
}

function requireMerchant(req: any, res: any, next: any) {
  if (!getMerchantOwnerId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Resolve the merchant row owned by the logged-in merchant account. */
async function resolveMerchant(ownerUserId: number) {
  const [m] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.ownerUserId, ownerUserId))
    .limit(1);
  return m ?? null;
}

// ─────────────────────────── Pendaftaran Warung ───────────────────────────
// POST /api/merchant/apply — daftar warung (multipart: ktp + shopPhoto)
router.post("/apply", applyUpload, async (req, res) => {
  const {
    ownerName,
    phone,
    email,
    password,
    shopName,
    category,
    description,
    address,
    lat,
    lng,
    operatingCity,
  } = req.body;

  if (!ownerName || !phone || !email || !password || !shopName || !address || !operatingCity) {
    res.status(400).json({ error: "Semua field wajib diisi" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password minimal 8 karakter" });
    return;
  }

  const existingApp = await db
    .select({ id: merchantApplicationsTable.id })
    .from(merchantApplicationsTable)
    .where(eq(merchantApplicationsTable.email, email))
    .limit(1);
  if (existingApp.length > 0) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }
  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existingUser.length > 0) {
    res.status(409).json({ error: "Email sudah dipakai akun lain" });
    return;
  }

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const uploadDoc = async (field: string, folder: string): Promise<string | null> => {
    const file = files?.[field]?.[0];
    if (!file) return null;
    try {
      return await uploadBufferToCloudinary(file.buffer, { folder });
    } catch (err) {
      req.log?.error({ err, field }, "Gagal upload dokumen warung");
      return null;
    }
  };
  const [ktpUrl, shopPhotoUrl] = await Promise.all([
    uploadDoc("ktp", "ride/merchant-docs"),
    uploadDoc("shopPhoto", "ride/merchant-docs"),
  ]);

  const latNum = lat != null && lat !== "" ? parseFloat(String(lat)) : null;
  const lngNum = lng != null && lng !== "" ? parseFloat(String(lng)) : null;

  const [application] = await db
    .insert(merchantApplicationsTable)
    .values({
      ownerName,
      phone,
      email,
      passwordHash: hashPassword(password),
      shopName,
      category: category || "food",
      description: description ?? null,
      address,
      lat: latNum,
      lng: lngNum,
      operatingCity,
      ktpPath: ktpUrl,
      shopPhotoPath: shopPhotoUrl,
      status: "pending",
    })
    .returning({
      id: merchantApplicationsTable.id,
      shopName: merchantApplicationsTable.shopName,
      email: merchantApplicationsTable.email,
      status: merchantApplicationsTable.status,
    });

  res.status(201).json({ message: "Pendaftaran warung berhasil dikirim", application });
});

// ─────────────────────────── Dashboard & Toko ───────────────────────────
// GET /api/merchant/dashboard — info toko + statistik hari ini
router.get("/dashboard", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) {
    res.status(404).json({ error: "Data warung tidak ditemukan" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingRow] = await db
    .select({ c: count() })
    .from(ordersTable)
    .where(and(eq(ordersTable.merchantId, merchant.id), eq(ordersTable.merchantStatus, "menunggu")));
  const [doneRow] = await db
    .select({ c: count(), revenue: sum(ordersTable.foodTotal) })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.merchantId, merchant.id),
        eq(ordersTable.status, "done"),
        sql`${ordersTable.createdAt} >= ${todayStart}`,
      ),
    );

  res.json({
    merchant,
    stats: {
      pending: Number(pendingRow?.c ?? 0),
      doneToday: Number(doneRow?.c ?? 0),
      revenueToday: Number(doneRow?.revenue ?? 0),
    },
  });
});

// PATCH /api/merchant/toggle-open — buka/tutup warung
router.patch("/toggle-open", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const isOpen = !!req.body?.isOpen;
  const [updated] = await db
    .update(merchantsTable)
    .set({ isOpen })
    .where(eq(merchantsTable.id, merchant.id))
    .returning({ id: merchantsTable.id, isOpen: merchantsTable.isOpen });
  res.json({ ok: true, isOpen: updated?.isOpen });
});

// PATCH /api/merchant/change-password
router.patch("/change-password", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: "Password baru minimal 8 karakter" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ownerId)).limit(1);
  if (!user || user.passwordHash !== hashPassword(oldPassword)) {
    res.status(401).json({ error: "Password lama salah" });
    return;
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, ownerId));
  res.json({ ok: true });
});

// ─────────────────────────── Menu CRUD ───────────────────────────
// GET /api/merchant/menu
router.get("/menu", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const menu = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.merchantId, merchant.id))
    .orderBy(asc(menuItemsTable.category), asc(menuItemsTable.name));
  res.json({ menu });
});

// POST /api/merchant/menu — tambah menu (multipart optional photo)
router.post("/menu", requireMerchant, (req, res, next) => {
  uploadImage.single("photo")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const { name, price, category, description } = req.body;
  if (!name) { res.status(400).json({ error: "Nama menu wajib diisi" }); return; }

  let photoUrl: string | null = null;
  if (req.file) {
    try { photoUrl = await uploadBufferToCloudinary(req.file.buffer, { folder: "ride/menu" }); }
    catch (err) { req.log?.error({ err }, "Gagal upload foto menu"); }
  }

  const [menuItem] = await db
    .insert(menuItemsTable)
    .values({
      merchantId: merchant.id,
      name,
      price: Math.max(0, parseInt(String(price)) || 0),
      category: category || null,
      description: description ?? null,
      photoPath: photoUrl,
      isAvailable: true,
    })
    .returning();
  res.status(201).json({ menuItem });
});

// PATCH /api/merchant/menu/:id — ubah menu (multipart optional photo)
router.patch("/menu/:id", requireMerchant, (req, res, next) => {
  uploadImage.single("photo")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    next();
  });
}, async (req: any, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const id = parseInt(String(req.params.id));

  const patch: Record<string, unknown> = {};
  const { name, price, category, description, isAvailable } = req.body;
  if (name != null) patch.name = name;
  if (price != null) patch.price = Math.max(0, parseInt(String(price)) || 0);
  if (category != null) patch.category = category || null;
  if (description != null) patch.description = description;
  if (isAvailable != null) patch.isAvailable = isAvailable === true || isAvailable === "true";
  if (req.file) {
    try { patch.photoPath = await uploadBufferToCloudinary(req.file.buffer, { folder: "ride/menu" }); }
    catch (err) { req.log?.error({ err }, "Gagal upload foto menu"); }
  }

  const [menuItem] = await db
    .update(menuItemsTable)
    .set(patch)
    .where(and(eq(menuItemsTable.id, id), eq(menuItemsTable.merchantId, merchant.id)))
    .returning();
  if (!menuItem) { res.status(404).json({ error: "Menu tidak ditemukan" }); return; }
  res.json({ menuItem });
});

// DELETE /api/merchant/menu/:id
router.delete("/menu/:id", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const id = parseInt(String(req.params.id));
  await db.delete(menuItemsTable).where(and(eq(menuItemsTable.id, id), eq(menuItemsTable.merchantId, merchant.id)));
  res.json({ ok: true });
});

// ─────────────────────────── Pesanan (GoFood) ───────────────────────────
const MERCHANT_ORDER_FIELDS = {
  id: ordersTable.id,
  orderNo: ordersTable.orderNo,
  serviceType: ordersTable.serviceType,
  status: ordersTable.status,
  merchantStatus: ordersTable.merchantStatus,
  merchantReadyAt: ordersTable.merchantReadyAt,
  orderItems: ordersTable.orderItems,
  foodTotal: ordersTable.foodTotal,
  itemNote: ordersTable.itemNote,
  destAddress: ordersTable.destAddress,
  mitraId: ordersTable.mitraId,
  trackingPhase: ordersTable.trackingPhase,
  penggunaName: usersTable.name,
  createdAt: ordersTable.createdAt,
} as const;

// GET /api/merchant/orders — pesanan aktif warung (real-time)
router.get("/orders", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }

  const orders = await db
    .select(MERCHANT_ORDER_FIELDS)
    .from(ordersTable)
    .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
    .where(
      and(
        eq(ordersTable.merchantId, merchant.id),
        inArray(ordersTable.status, ["pending", "accepted"]),
        inArray(ordersTable.merchantStatus, ["menunggu", "diterima", "siap"]),
      ),
    )
    .orderBy(desc(ordersTable.createdAt));
  res.json({ orders });
});

// GET /api/merchant/order-history — pesanan selesai/batal
router.get("/order-history", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const orders = await db
    .select(MERCHANT_ORDER_FIELDS)
    .from(ordersTable)
    .innerJoin(usersTable, eq(usersTable.id, ordersTable.penggunaId))
    .where(and(eq(ordersTable.merchantId, merchant.id), inArray(ordersTable.status, ["done", "cancelled"])))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);
  res.json({ orders });
});

/** Guarded update of merchant_status for an order that belongs to this merchant. */
async function loadMerchantOrder(merchantId: number, orderId: number) {
  const [order] = await db
    .select({
      id: ordersTable.id,
      orderNo: ordersTable.orderNo,
      penggunaId: ordersTable.penggunaId,
      mitraId: ordersTable.mitraId,
      status: ordersTable.status,
      merchantStatus: ordersTable.merchantStatus,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.merchantId, merchantId)))
    .limit(1);
  return order ?? null;
}

// PATCH /api/merchant/orders/:id/accept — warung menerima & mulai memasak
router.patch("/orders/:id/accept", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const orderId = parseInt(String(req.params.id));
  const order = await loadMerchantOrder(merchant.id, orderId);
  if (!order) { res.status(404).json({ error: "Pesanan tidak ditemukan" }); return; }
  if (order.merchantStatus !== "menunggu") {
    res.status(409).json({ error: "Pesanan tidak dapat diterima pada status ini" });
    return;
  }
  await db.update(ordersTable).set({ merchantStatus: "diterima", updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
  emitMerchantStatus(order, "diterima");
  res.json({ ok: true });
});

// PATCH /api/merchant/orders/:id/ready — makanan siap diambil ojol
router.patch("/orders/:id/ready", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const orderId = parseInt(String(req.params.id));
  const order = await loadMerchantOrder(merchant.id, orderId);
  if (!order) { res.status(404).json({ error: "Pesanan tidak ditemukan" }); return; }
  if (order.merchantStatus !== "diterima") {
    res.status(409).json({ error: "Terima pesanan terlebih dahulu sebelum menandai siap" });
    return;
  }
  await db.update(ordersTable).set({ merchantStatus: "siap", merchantReadyAt: new Date(), updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
  emitMerchantStatus(order, "siap");
  if (order.mitraId) {
    sendPushToUsers([order.mitraId], {
      title: "🍽️ Makanan Siap Diambil",
      body: `Pesanan ${order.orderNo} sudah siap. Silakan jemput di warung.`,
      url: "/",
    }, "pesanan");
  }
  res.json({ ok: true });
});

// PATCH /api/merchant/orders/:id/reject — warung menolak pesanan (batalkan order)
router.patch("/orders/:id/reject", requireMerchant, async (req, res) => {
  const ownerId = getMerchantOwnerId(req) as number;
  const merchant = await resolveMerchant(ownerId);
  if (!merchant) { res.status(404).json({ error: "Data warung tidak ditemukan" }); return; }
  const orderId = parseInt(String(req.params.id));
  const { reason } = req.body ?? {};
  const order = await loadMerchantOrder(merchant.id, orderId);
  if (!order) { res.status(404).json({ error: "Pesanan tidak ditemukan" }); return; }
  if (order.merchantStatus === "siap") {
    res.status(409).json({ error: "Pesanan yang sudah siap tidak dapat ditolak" });
    return;
  }
  await db
    .update(ordersTable)
    .set({ status: "cancelled", canceledBy: "merchant", cancelReason: reason ?? "Warung menolak pesanan", merchantStatus: "ditolak", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  try {
    io?.to(`user:${order.penggunaId}`).emit("order:cancelled", { orderId, canceledBy: "merchant", cancelReason: reason ?? "Warung menolak pesanan" });
    io?.to(`order:${orderId}`).emit("order:cancelled", { orderId, canceledBy: "merchant", cancelReason: reason ?? "Warung menolak pesanan" });
    if (order.mitraId) io?.to(`user:${order.mitraId}`).emit("order:cancelled", { orderId, canceledBy: "merchant" });
    io?.to("room:admin").emit("admin:order_update", { type: "cancelled", orderId });
    sendPushToUsers([order.penggunaId], {
      title: "❌ Warung Menolak Pesanan",
      body: reason ? `Alasan: ${reason}` : "Warung tidak dapat memenuhi pesanan Anda.",
      url: "/",
    }, "pesanan");
  } catch { /* ignore */ }
  res.json({ ok: true });
});

/** Emit merchant prep status to pengguna, assigned ojol, and order room. */
function emitMerchantStatus(
  order: { id: number; penggunaId: number; mitraId: number | null },
  merchantStatus: string,
) {
  try {
    const payload = { orderId: order.id, merchantStatus };
    io?.to(`user:${order.penggunaId}`).emit("order:merchant_status", payload);
    io?.to(`order:${order.id}`).emit("order:merchant_status", payload);
    if (order.mitraId) io?.to(`user:${order.mitraId}`).emit("order:merchant_status", payload);
    io?.to("room:admin").emit("admin:order_update", { type: "merchant_status", orderId: order.id });
  } catch { /* ignore */ }
}

export default router;
