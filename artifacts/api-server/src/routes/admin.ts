import { Router } from "express";
import { db, usersTable, ordersTable, mitraApplicationsTable, mitraLocationsTable, systemSettingsTable, vouchersTable, reportsTable } from "@workspace/db";
import { eq, and, or, desc, asc, sql, count, sum, ilike, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { sendPushToUsers } from "./push";

const router = Router();

function hashPassword(password: string): string {
  const salt = process.env.SESSION_SECRET;
  if (!salt) throw new Error("SESSION_SECRET tidak ditemukan");
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function getAdminId(req: Request): number | null {
  const s = req.session as Record<string, unknown>;
  return s.adminId ? Number(s.adminId) : null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!getAdminId(req)) {
    res.status(401).json({ error: "Akses ditolak. Login admin diperlukan." });
    return;
  }
  next();
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

// ── Auth ──────────────────────────────────────────────────────────────────────

// POST /api/admin/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400).json({ error: "Email dan password wajib diisi" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !user.isAdmin) { res.status(401).json({ error: "Akun admin tidak ditemukan" }); return; }
  if (user.passwordHash !== hashPassword(password)) { res.status(401).json({ error: "Password salah" }); return; }
  (req.session as Record<string, unknown>).adminId = user.id;
  (req.session as Record<string, unknown>).adminName = user.name;
  res.json({ ok: true, admin: { id: user.id, name: user.name, email: user.email } });
});

// GET /api/admin/me
router.get("/me", requireAdmin, async (req, res) => {
  const adminId = getAdminId(req)!;
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, adminId)).limit(1);
  res.json(user ?? { error: "Not found" });
});

// POST /api/admin/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

// GET /api/admin/dashboard/stats
router.get("/dashboard/stats", requireAdmin, async (_req, res) => {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0,0,0,0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [[ordersToday], [ordersWeek], [ordersMonth], [totalOrders],
         [totalPlatformFee], [weekFee], [pendingMitra], [totalMitra],
         [totalPengguna], [newPenggunaWeek], [activeOrders]] = await Promise.all([
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, todayStart))),
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, weekStart))),
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, monthStart))),
    db.select({ c: count() }).from(ordersTable).where(eq(ordersTable.status, "done")),
    db.select({ total: sum(ordersTable.platformFee) }).from(ordersTable).where(eq(ordersTable.status, "done")),
    db.select({ total: sum(ordersTable.platformFee) }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, weekStart))),
    db.select({ c: count() }).from(mitraApplicationsTable).where(eq(mitraApplicationsTable.status, "pending")),
    db.select({ c: count() }).from(mitraApplicationsTable).where(or(eq(mitraApplicationsTable.status, "approved"), eq(mitraApplicationsTable.status, "pending"))),
    db.select({ c: count() }).from(usersTable).where(and(eq(usersTable.role, "pengguna"), eq(usersTable.isAdmin, false))),
    db.select({ c: count() }).from(usersTable).where(and(eq(usersTable.role, "pengguna"), gte(usersTable.createdAt, weekStart))),
    db.select({ c: count() }).from(ordersTable).where(inArray(ordersTable.status, ["pending", "accepted"])),
  ]);

  res.json({
    ordersToday: Number(ordersToday.c),
    ordersWeek: Number(ordersWeek.c),
    ordersMonth: Number(ordersMonth.c),
    totalOrders: Number(totalOrders.c),
    totalPlatformFee: Number(totalPlatformFee.total ?? 0),
    weekPlatformFee: Number(weekFee.total ?? 0),
    pendingMitra: Number(pendingMitra.c),
    totalMitra: Number(totalMitra.c),
    totalPengguna: Number(totalPengguna.c),
    newPenggunaWeek: Number(newPenggunaWeek.c),
    activeOrders: Number(activeOrders.c),
  });
});

// GET /api/admin/dashboard/chart/orders  — 14 hari terakhir
router.get("/dashboard/chart/orders", requireAdmin, async (_req, res) => {
  const days: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const [row] = await db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, d), lte(ordersTable.createdAt, next)));
    days.push({ date: fmtDate(d), count: Number(row.c) });
  }
  res.json(days);
});

// GET /api/admin/dashboard/chart/revenue — 14 hari terakhir
router.get("/dashboard/chart/revenue", requireAdmin, async (_req, res) => {
  const days: { date: string; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const [row] = await db.select({ total: sum(ordersTable.platformFee) }).from(ordersTable).where(and(eq(ordersTable.status, "done"), gte(ordersTable.createdAt, d), lte(ordersTable.createdAt, next)));
    days.push({ date: fmtDate(d), revenue: Number(row.total ?? 0) });
  }
  res.json(days);
});

// GET /api/admin/dashboard/chart/by-service
router.get("/dashboard/chart/by-service", requireAdmin, async (_req, res) => {
  const rows = await db.select({ serviceType: ordersTable.serviceType, c: count(), fee: sum(ordersTable.platformFee) })
    .from(ordersTable).where(eq(ordersTable.status, "done"))
    .groupBy(ordersTable.serviceType);
  res.json(rows.map(r => ({ serviceType: r.serviceType, count: Number(r.c), fee: Number(r.fee ?? 0) })));
});

// ── Mitra Management ──────────────────────────────────────────────────────────

// GET /api/admin/mitra?status=&search=&page=&limit=
router.get("/mitra", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const baseWhere = [];
  if (status && status !== "all") baseWhere.push(eq(mitraApplicationsTable.status, status));
  if (search) baseWhere.push(or(ilike(mitraApplicationsTable.name, `%${search}%`), ilike(mitraApplicationsTable.email, `%${search}%`))!);

  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: mitraApplicationsTable.id,
      name: mitraApplicationsTable.name,
      email: mitraApplicationsTable.email,
      phone: mitraApplicationsTable.phone,
      serviceType: mitraApplicationsTable.serviceType,
      operatingCity: mitraApplicationsTable.operatingCity,
      status: mitraApplicationsTable.status,
      createdAt: mitraApplicationsTable.createdAt,
    }).from(mitraApplicationsTable)
      .where(baseWhere.length > 0 ? and(...baseWhere as [any, ...any[]]) : undefined)
      .orderBy(desc(mitraApplicationsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ c: count() }).from(mitraApplicationsTable)
      .where(baseWhere.length > 0 ? and(...baseWhere as [any, ...any[]]) : undefined),
  ]);

  // Get order counts + platform fee + avg rating per mitra
  const mitraEmails = rows.map(r => r.email);
  let orderCounts: Record<string, number> = {};
  let platformFeeTotals: Record<string, number> = {};
  let avgRatings: Record<string, number | null> = {};
  if (mitraEmails.length > 0) {
    const userRows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable)
      .where(inArray(usersTable.email, mitraEmails));
    const userIdToEmail = Object.fromEntries(userRows.map(u => [u.id, u.email]));
    const userIds = userRows.map(u => u.id);
    if (userIds.length > 0) {
      const stats = await db.select({
        mitraId: ordersTable.mitraId,
        c: count(),
        totalFee: sum(ordersTable.platformFee),
        avgRating: sql<number>`AVG(${ordersTable.rating})`,
      }).from(ordersTable)
        .where(and(eq(ordersTable.status, "done"), inArray(ordersTable.mitraId, userIds as [number, ...number[]])))
        .groupBy(ordersTable.mitraId);
      for (const s of stats) {
        const email = userIdToEmail[s.mitraId!];
        if (email) {
          orderCounts[email] = Number(s.c);
          platformFeeTotals[email] = Number(s.totalFee ?? 0);
          avgRatings[email] = s.avgRating != null ? Math.round(Number(s.avgRating) * 10) / 10 : null;
        }
      }
    }
  }

  res.json({
    data: rows.map(r => ({
      ...r,
      totalOrders: orderCounts[r.email] ?? 0,
      platformFeeTotal: platformFeeTotals[r.email] ?? 0,
      avgRating: avgRatings[r.email] ?? null,
    })),
    total: Number(totalRow.c),
    page,
    limit,
  });
});

// GET /api/admin/mitra/:email — detail by email
router.get("/mitra/:email", requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const [app] = await db.select().from(mitraApplicationsTable).where(eq(mitraApplicationsTable.email, email)).limit(1);
  if (!app) { res.status(404).json({ error: "Mitra tidak ditemukan" }); return; }
  const [user] = await db.select({ id: usersTable.id, isSuspended: usersTable.isSuspended, walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  let orders: any[] = [];
  let platformFeeTotal = 0;
  if (user) {
    orders = await db.select({ id: ordersTable.id, orderNo: ordersTable.orderNo, serviceType: ordersTable.serviceType, status: ordersTable.status, totalAmount: ordersTable.totalAmount, platformFee: ordersTable.platformFee, createdAt: ordersTable.createdAt })
      .from(ordersTable).where(eq(ordersTable.mitraId, user.id)).orderBy(desc(ordersTable.createdAt)).limit(20);
    const [feeRow] = await db.select({ total: sum(ordersTable.platformFee) }).from(ordersTable).where(and(eq(ordersTable.mitraId, user.id), eq(ordersTable.status, "done")));
    platformFeeTotal = Number(feeRow.total ?? 0);
  }
  res.json({ ...app, userId: user?.id, isSuspended: user?.isSuspended ?? false, orders, platformFeeTotal });
});

// PATCH /api/admin/mitra/:email/status
router.patch("/mitra/:email/status", requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { status } = req.body; // "approved" | "rejected" | "suspended" | "active"
  if (!["approved", "rejected", "pending"].includes(status)) { res.status(400).json({ error: "Status tidak valid" }); return; }
  await db.update(mitraApplicationsTable).set({ status }).where(eq(mitraApplicationsTable.email, email));
  res.json({ ok: true });
});

// PATCH /api/admin/mitra/:email/suspend
router.patch("/mitra/:email/suspend", requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { suspended } = req.body;
  await db.update(usersTable).set({ isSuspended: !!suspended }).where(eq(usersTable.email, email));
  res.json({ ok: true });
});

// ── Pengguna Management ───────────────────────────────────────────────────────

// GET /api/admin/pengguna?search=&page=&limit=
router.get("/pengguna", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const search = req.query.search as string | undefined;

  const whereClause = [eq(usersTable.role, "pengguna"), eq(usersTable.isAdmin, false)];
  if (search) whereClause.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`))! as any);

  const [rows, [totalRow]] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, isSuspended: usersTable.isSuspended, walletBalance: usersTable.walletBalance, createdAt: usersTable.createdAt })
      .from(usersTable).where(and(...whereClause as [any, ...any[]])).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(usersTable).where(and(...whereClause as [any, ...any[]])),
  ]);

  // Get order counts
  const userIds = rows.map(r => r.id);
  let orderCounts: Record<number, number> = {};
  if (userIds.length > 0) {
    const counts = await db.select({ penggunaId: ordersTable.penggunaId, c: count() })
      .from(ordersTable).where(inArray(ordersTable.penggunaId, userIds as [number, ...number[]])).groupBy(ordersTable.penggunaId);
    for (const c of counts) orderCounts[c.penggunaId] = Number(c.c);
  }

  res.json({ data: rows.map(r => ({ ...r, totalOrders: orderCounts[r.id] ?? 0 })), total: Number(totalRow.c), page, limit });
});

// GET /api/admin/pengguna/:id
router.get("/pengguna/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Pengguna tidak ditemukan" }); return; }
  const orders = await db.select({ id: ordersTable.id, orderNo: ordersTable.orderNo, serviceType: ordersTable.serviceType, status: ordersTable.status, totalAmount: ordersTable.totalAmount, createdAt: ordersTable.createdAt })
    .from(ordersTable).where(eq(ordersTable.penggunaId, id)).orderBy(desc(ordersTable.createdAt)).limit(20);
  res.json({ ...user, passwordHash: undefined, orders });
});

// PATCH /api/admin/pengguna/:id/suspend
router.patch("/pengguna/:id/suspend", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { suspended } = req.body;
  await db.update(usersTable).set({ isSuspended: !!suspended }).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

// ── Orders Monitoring ─────────────────────────────────────────────────────────

// GET /api/admin/orders?status=&serviceType=&search=&page=&limit=
router.get("/orders", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const serviceType = req.query.serviceType as string | undefined;

  const where: any[] = [];
  if (status && status !== "all") where.push(eq(ordersTable.status, status));
  if (serviceType && serviceType !== "all") where.push(eq(ordersTable.serviceType, serviceType));

  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: ordersTable.id, orderNo: ordersTable.orderNo, serviceType: ordersTable.serviceType,
      status: ordersTable.status, totalAmount: ordersTable.totalAmount, platformFee: ordersTable.platformFee,
      pickupAddress: ordersTable.pickupAddress, createdAt: ordersTable.createdAt,
      penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId,
    }).from(ordersTable).where(where.length > 0 ? and(...where as [any, ...any[]]) : undefined)
      .orderBy(desc(ordersTable.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(ordersTable).where(where.length > 0 ? and(...where as [any, ...any[]]) : undefined),
  ]);

  // Get pengguna + mitra names
  const userIds = [...new Set([...rows.map(r => r.penggunaId), ...rows.filter(r => r.mitraId).map(r => r.mitraId!)])];
  let nameMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds as [number, ...number[]]));
    nameMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  }

  res.json({
    data: rows.map(r => ({ ...r, penggunaName: nameMap[r.penggunaId] ?? "-", mitraName: r.mitraId ? nameMap[r.mitraId] ?? "-" : "-" })),
    total: Number(totalRow.c), page, limit,
  });
});

// GET /api/admin/orders/:id
router.get("/orders/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }

  const ids = [order.penggunaId, ...(order.mitraId ? [order.mitraId] : [])];
  const users = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    phone: usersTable.phone, walletBalance: usersTable.walletBalance,
  }).from(usersTable).where(inArray(usersTable.id, ids as [number, ...number[]]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  let mitraApp = null;
  if (order.mitraId) {
    const mitraUser = userMap[order.mitraId];
    if (mitraUser?.email) {
      const [app] = await db.select({
        serviceType: mitraApplicationsTable.serviceType,
        operatingCity: mitraApplicationsTable.operatingCity,
        status: mitraApplicationsTable.status,
      }).from(mitraApplicationsTable).where(eq(mitraApplicationsTable.email, mitraUser.email)).limit(1);
      mitraApp = app ?? null;
    }
  }

  const pengguna = userMap[order.penggunaId] ?? null;
  const mitraUser = order.mitraId ? userMap[order.mitraId] ?? null : null;

  res.json({
    ...order,
    pengguna: pengguna ? { ...pengguna } : null,
    mitra: mitraUser ? { ...mitraUser, serviceType: mitraApp?.serviceType, operatingCity: mitraApp?.operatingCity, mitraStatus: mitraApp?.status } : null,
  });
});

// PATCH /api/admin/orders/:id/cancel
router.patch("/orders/:id/cancel", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(ordersTable.id, id), inArray(ordersTable.status, ["pending", "accepted"] as [string, ...string[]])));
  res.json({ ok: true });
});

// ── Keuangan ──────────────────────────────────────────────────────────────────

// GET /api/admin/keuangan/summary
router.get("/keuangan/summary", requireAdmin, async (_req, res) => {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  // Semua pembayaran (cash/transfer/QRIS) masuk ke mitra dulu.
  // Platform fee harus disetorkan mitra ke RIDE.
  // isPlatformFeePaid = true → sudah disetorkan/lunas
  // isPlatformFeePaid = false → masih terutang (belum dibayar ke RIDE)
  const done = eq(ordersTable.status, "done");
  const unpaid = eq(ordersTable.isPlatformFeePaid, false);
  const paid = eq(ordersTable.isPlatformFeePaid, true);

  const [[allTime], [thisMonth], [lastMonth], [unpaidAll], [unpaidMonth], [paidAll]] = await Promise.all([
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(done),
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(and(done, gte(ordersTable.createdAt, monthStart))),
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(and(done, gte(ordersTable.createdAt, lastMonthStart), lte(ordersTable.createdAt, monthStart))),
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(and(done, unpaid)),
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(and(done, unpaid, gte(ordersTable.createdAt, monthStart))),
    db.select({ total: sum(ordersTable.platformFee), c: count() }).from(ordersTable).where(and(done, paid)),
  ]);
  res.json({
    allTimeTotal: Number(allTime.total ?? 0), allTimeOrders: Number(allTime.c),
    thisMonthTotal: Number(thisMonth.total ?? 0), thisMonthOrders: Number(thisMonth.c),
    lastMonthTotal: Number(lastMonth.total ?? 0), lastMonthOrders: Number(lastMonth.c),
    unpaidTotal: Number(unpaidAll.total ?? 0), unpaidOrders: Number(unpaidAll.c),
    unpaidThisMonth: Number(unpaidMonth.total ?? 0), unpaidThisMonthOrders: Number(unpaidMonth.c),
    paidTotal: Number(paidAll.total ?? 0), paidOrders: Number(paidAll.c),
  });
});

// GET /api/admin/keuangan/fee-per-mitra?page=&limit=
router.get("/keuangan/fee-per-mitra", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const doneMitra = and(eq(ordersTable.status, "done"), sql`${ordersTable.mitraId} IS NOT NULL`);

  // Total platform fee per mitra
  const rows = await db.select({
    mitraId: ordersTable.mitraId,
    total: sum(ordersTable.platformFee),
    c: count(),
  }).from(ordersTable).where(doneMitra)
    .groupBy(ordersTable.mitraId)
    .orderBy(desc(sum(ordersTable.platformFee)))
    .limit(limit).offset(offset);

  const mitraIds = rows.filter(r => r.mitraId).map(r => r.mitraId!);
  let nameMap: Record<number, { name: string; email: string }> = {};
  if (mitraIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, mitraIds as [number, ...number[]]));
    nameMap = Object.fromEntries(users.map(u => [u.id, { name: u.name, email: u.email }]));
  }

  // Fee belum dibayar ke RIDE (isPlatformFeePaid = false)
  let unpaidMap: Record<number, number> = {};
  let unpaidCountMap: Record<number, number> = {};
  if (mitraIds.length > 0) {
    const unpaidRows = await db.select({
      mitraId: ordersTable.mitraId,
      unpaid: sum(ordersTable.platformFee),
      uc: count(),
    }).from(ordersTable)
      .where(and(
        eq(ordersTable.status, "done"),
        eq(ordersTable.isPlatformFeePaid, false),
        sql`${ordersTable.mitraId} IS NOT NULL`,
        inArray(ordersTable.mitraId, mitraIds as [number, ...number[]]),
      ))
      .groupBy(ordersTable.mitraId);
    for (const r of unpaidRows) {
      if (r.mitraId) {
        unpaidMap[r.mitraId] = Number(r.unpaid ?? 0);
        unpaidCountMap[r.mitraId] = Number(r.uc);
      }
    }
  }

  res.json(rows.map(r => ({
    mitraId: r.mitraId,
    mitraName: r.mitraId ? (nameMap[r.mitraId]?.name ?? "-") : "-",
    mitraEmail: r.mitraId ? (nameMap[r.mitraId]?.email ?? "-") : "-",
    totalFee: Number(r.total ?? 0),
    totalOrders: Number(r.c),
    unpaidFee: r.mitraId ? (unpaidMap[r.mitraId] ?? 0) : 0,
    unpaidOrders: r.mitraId ? (unpaidCountMap[r.mitraId] ?? 0) : 0,
  })));
});

// PATCH /api/admin/keuangan/mark-paid/:mitraId — tandai semua fee mitra sebagai lunas
router.patch("/keuangan/mark-paid/:mitraId", requireAdmin, async (req, res) => {
  const mitraId = parseInt(req.params.mitraId);
  const now = new Date();
  const result = await db.update(ordersTable)
    .set({ isPlatformFeePaid: true, platformFeePaidAt: now, updatedAt: now })
    .where(and(
      eq(ordersTable.status, "done"),
      eq(ordersTable.isPlatformFeePaid, false),
      eq(ordersTable.mitraId, mitraId),
    ));
  res.json({ ok: true, paidAt: now });
});

// ── Orders Live ───────────────────────────────────────────────────────────────

// GET /api/admin/orders/live — order yang sedang aktif (pending/accepted)
router.get("/orders/live", requireAdmin, async (_req, res) => {
  const rows = await db.select({
    id: ordersTable.id,
    orderNo: ordersTable.orderNo,
    serviceType: ordersTable.serviceType,
    status: ordersTable.status,
    totalAmount: ordersTable.totalAmount,
    createdAt: ordersTable.createdAt,
    updatedAt: ordersTable.updatedAt,
    penggunaId: ordersTable.penggunaId,
    mitraId: ordersTable.mitraId,
    pickupAddress: ordersTable.pickupAddress,
  }).from(ordersTable)
    .where(inArray(ordersTable.status, ["pending", "accepted"] as [string, ...string[]]))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);

  const penggunaIds = [...new Set(rows.map(r => r.penggunaId).filter(Boolean))];
  const mitraIds = [...new Set(rows.map(r => r.mitraId).filter(Boolean))] as number[];

  const [penggunaList, mitraList] = await Promise.all([
    penggunaIds.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone }).from(usersTable).where(inArray(usersTable.id, penggunaIds as number[])) : [],
    mitraIds.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, mitraIds)) : [],
  ]);

  const penggunaMap = Object.fromEntries(penggunaList.map(u => [u.id, u]));
  const mitraMap = Object.fromEntries(mitraList.map(u => [u.id, u]));

  res.json(rows.map(r => ({
    ...r,
    pengguna: r.penggunaId ? penggunaMap[r.penggunaId] ?? null : null,
    mitra: r.mitraId ? mitraMap[r.mitraId] ?? null : null,
  })));
});

// ── Tiket / Laporan Pengguna ───────────────────────────────────────────────────

// GET /api/admin/reports — semua laporan dari pengguna
router.get("/reports", requireAdmin, async (req, res) => {
  const { status = "all", page = "1", limit = "20" } = req.query as Record<string, string>;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions: any[] = [];
  if (status !== "all") conditions.push(eq(reportsTable.status, status));

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: reportsTable.id,
      title: reportsTable.title,
      type: reportsTable.type,
      message: reportsTable.message,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
      userId: reportsTable.userId,
      orderId: reportsTable.orderId,
      orderNo: reportsTable.orderNo,
      adminNote: reportsTable.adminNote,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
    }).from(reportsTable)
      .innerJoin(usersTable, eq(usersTable.id, reportsTable.userId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportsTable.createdAt))
      .limit(parseInt(limit))
      .offset(offset),
    db.select({ total: count() }).from(reportsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json({ rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// PATCH /api/admin/reports/:id/status — update status & catatan admin tiket
router.patch("/reports/:id/status", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, adminNote } = req.body as { status: string; adminNote?: string };
  if (!["open", "in_progress", "resolved"].includes(status)) {
    res.status(400).json({ error: "Status tidak valid" }); return;
  }
  const updateData: any = { status };
  if (adminNote !== undefined) updateData.adminNote = adminNote.trim() || null;
  await db.update(reportsTable).set(updateData).where(eq(reportsTable.id, id));
  res.json({ ok: true });
});

// ── Vouchers ──────────────────────────────────────────────────────────────────

// GET /api/admin/vouchers
router.get("/vouchers", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(vouchersTable).orderBy(desc(vouchersTable.createdAt));
  res.json(rows);
});

// POST /api/admin/vouchers
router.post("/vouchers", requireAdmin, async (req, res) => {
  const { code, discountType, discountValue, minOrder, maxDiscount, usageLimit, expiresAt, description } = req.body;
  if (!code || !discountType || !discountValue) { res.status(400).json({ error: "Data tidak lengkap" }); return; }
  const [v] = await db.insert(vouchersTable).values({
    code: code.toUpperCase().trim(),
    discountType,
    discountValue: Number(discountValue),
    minOrder: Number(minOrder) || 0,
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    description,
  }).returning();
  res.json(v);
});

// PATCH /api/admin/vouchers/:id
router.patch("/vouchers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { code, discountType, discountValue, minOrder, maxDiscount, usageLimit, expiresAt, description, isActive } = req.body;
  const updates: any = {};
  if (code !== undefined) updates.code = code.toUpperCase().trim();
  if (discountType !== undefined) updates.discountType = discountType;
  if (discountValue !== undefined) updates.discountValue = Number(discountValue);
  if (minOrder !== undefined) updates.minOrder = Number(minOrder);
  if (maxDiscount !== undefined) updates.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
  if (usageLimit !== undefined) updates.usageLimit = usageLimit ? Number(usageLimit) : null;
  if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (description !== undefined) updates.description = description;
  if (isActive !== undefined) updates.isActive = !!isActive;
  await db.update(vouchersTable).set(updates).where(eq(vouchersTable.id, id));
  res.json({ ok: true });
});

// DELETE /api/admin/vouchers/:id
router.delete("/vouchers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(vouchersTable).where(eq(vouchersTable.id, id));
  res.json({ ok: true });
});

// ── Laporan & Analitik ────────────────────────────────────────────────────────

// GET /api/admin/laporan/by-service
router.get("/laporan/by-service", requireAdmin, async (_req, res) => {
  const rows = await db.select({ serviceType: ordersTable.serviceType, c: count(), fee: sum(ordersTable.platformFee), avg: sql<number>`AVG(${ordersTable.totalAmount})` })
    .from(ordersTable).where(eq(ordersTable.status, "done")).groupBy(ordersTable.serviceType).orderBy(desc(count()));
  res.json(rows.map(r => ({ serviceType: r.serviceType, count: Number(r.c), fee: Number(r.fee ?? 0), avgTotal: Math.round(Number(r.avg ?? 0)) })));
});

// GET /api/admin/laporan/by-city
router.get("/laporan/by-city", requireAdmin, async (_req, res) => {
  const rows = await db.select({ city: mitraApplicationsTable.operatingCity, c: count(), fee: sum(ordersTable.platformFee) })
    .from(ordersTable)
    .innerJoin(usersTable, eq(ordersTable.mitraId, usersTable.id))
    .innerJoin(mitraApplicationsTable, eq(usersTable.email, mitraApplicationsTable.email))
    .where(eq(ordersTable.status, "done"))
    .groupBy(mitraApplicationsTable.operatingCity).orderBy(desc(count()));
  res.json(rows.map(r => ({ city: r.city, count: Number(r.c), fee: Number(r.fee ?? 0) })));
});

// GET /api/admin/laporan/top-mitra
router.get("/laporan/top-mitra", requireAdmin, async (_req, res) => {
  const rows = await db.select({ mitraId: ordersTable.mitraId, c: count(), fee: sum(ordersTable.platformFee), avgRating: sql<number>`AVG(${ordersTable.rating})` })
    .from(ordersTable).where(and(eq(ordersTable.status, "done"), sql`${ordersTable.mitraId} IS NOT NULL`))
    .groupBy(ordersTable.mitraId).orderBy(desc(count())).limit(10);

  const mitraIds = rows.filter(r => r.mitraId).map(r => r.mitraId!);
  let nameMap: Record<number, string> = {};
  if (mitraIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, mitraIds as [number, ...number[]]));
    nameMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  }
  res.json(rows.map(r => ({ mitraId: r.mitraId, mitraName: r.mitraId ? (nameMap[r.mitraId] ?? "-") : "-", totalOrders: Number(r.c), totalFee: Number(r.fee ?? 0), avgRating: r.avgRating ? Number(r.avgRating.toFixed(1)) : null })));
});

// ── System Settings ───────────────────────────────────────────────────────────

// GET /api/admin/settings
router.get("/settings", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(systemSettingsTable).orderBy(asc(systemSettingsTable.key));
  res.json(Object.fromEntries(rows.map(r => [r.key, { value: r.value, label: r.label }])));
});

// PATCH /api/admin/settings
router.patch("/settings", requireAdmin, async (req, res) => {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await db.insert(systemSettingsTable)
      .values({ key, value: String(value), label: key, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(value), updatedAt: new Date() } });
  }
  res.json({ ok: true });
});

// ── Admin Accounts ────────────────────────────────────────────────────────────

// POST /api/admin/accounts — buat admin baru
router.post("/accounts", requireAdmin, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) { res.status(400).json({ error: "Data tidak lengkap" }); return; }
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Email sudah terdaftar" }); return; }
  const [user] = await db.insert(usersTable).values({ name, email, passwordHash: hashPassword(password), role: "pengguna", isAdmin: true }).returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
  res.json(user);
});

// GET /api/admin/accounts — list admin
router.get("/accounts", requireAdmin, async (_req, res) => {
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.isAdmin, true)).orderBy(desc(usersTable.createdAt));
  res.json(rows);
});

// PATCH /api/admin/accounts/:id/password
router.patch("/accounts/:id/password", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { password } = req.body;
  if (!password || password.length < 6) { res.status(400).json({ error: "Password minimal 6 karakter" }); return; }
  await db.update(usersTable).set({ passwordHash: hashPassword(password) }).where(and(eq(usersTable.id, id), eq(usersTable.isAdmin, true)));
  res.json({ ok: true });
});

// GET /api/admin/orders/export — export semua order sebagai JSON untuk CSV di client
router.get("/orders/export", requireAdmin, async (req, res) => {
  const { status = "all", serviceType = "all", from, to } = req.query as Record<string, string>;
  const conditions: any[] = [];
  if (status !== "all") conditions.push(eq(ordersTable.status, status));
  if (serviceType !== "all") conditions.push(eq(ordersTable.serviceType, serviceType));
  if (from) conditions.push(gte(ordersTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(ordersTable.createdAt, new Date(to)));

  const rows = await db
    .select({
      id: ordersTable.id, orderNo: ordersTable.orderNo,
      serviceType: ordersTable.serviceType, status: ordersTable.status,
      totalAmount: ordersTable.totalAmount, platformFee: ordersTable.platformFee,
      isPlatformFeePaid: ordersTable.isPlatformFeePaid,
      pickupAddress: ordersTable.pickupAddress,
      penggunaName: usersTable.name,
      createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.penggunaId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(5000);

  res.json(rows);
});

// POST /api/admin/broadcast — kirim push notification ke semua user/mitra/pengguna
router.post("/broadcast", requireAdmin, async (req, res) => {
  const { title, body, target = "all" } = req.body;
  if (!title || !body) { res.status(400).json({ error: "title dan body wajib diisi" }); return; }

  const roleCondition = target === "mitra" ? eq(usersTable.role, "mitra")
    : target === "pengguna" ? eq(usersTable.role, "pengguna") : null;
  const whereClause = roleCondition
    ? and(eq(usersTable.isSuspended, false), roleCondition)
    : eq(usersTable.isSuspended, false);

  const allUsers = await db.select({ id: usersTable.id }).from(usersTable).where(whereClause);
  const userIds = allUsers.map(u => u.id);
  if (userIds.length === 0) { res.json({ sent: 0 }); return; }

  await sendPushToUsers(userIds, { title, body, url: "/" });
  res.json({ sent: userIds.length });
});

export default router;
