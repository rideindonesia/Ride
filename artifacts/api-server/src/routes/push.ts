import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, usersTable, notificationsTable } from "@workspace/db/schema";
import { eq, inArray, and, desc, count } from "drizzle-orm";

const router = Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (PUSH_ENABLED) {
  webpush.setVapidDetails("mailto:admin@ride.app", VAPID_PUBLIC_KEY as string, VAPID_PRIVATE_KEY as string);
} else {
  console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled");
}

// GET /api/push/vapid-public-key
router.get("/vapid-public-key", (_req, res) => {
  if (!PUSH_ENABLED) return res.status(503).json({ error: "Push notifications not configured" });
  return res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
router.post("/subscribe", async (req, res) => {
  if (!PUSH_ENABLED) return res.status(503).json({ error: "Push notifications not configured" });
  const session = req.session as any;
  const pCookieId = (req as any).signedCookies?.["ride-p-uid"] ? parseInt((req as any).signedCookies["ride-p-uid"]) : undefined;
  const mCookieId = (req as any).signedCookies?.["ride-m-uid"] ? parseInt((req as any).signedCookies["ride-m-uid"]) : undefined;
  const userId = session?.penggunaId || session?.mitraId || mCookieId || pCookieId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription" });
  }
  try {
    await db.insert(pushSubscriptionsTable)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptionsTable.endpoint, set: { userId, p256dh: keys.p256dh, auth: keys.auth } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

// DELETE /api/push/unsubscribe
router.delete("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "No endpoint" });
  try {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

// Resolusi userId SECARA SPESIFIK per peran. Wajib dipakai untuk endpoint yang
// menyimpan data per-akun (mis. preferensi notifikasi), karena satu device bisa
// login sebagai pengguna DAN mitra sekaligus (lihat catatan chat cross-role di replit.md).
function userIdForRole(req: any, role: string | undefined): number | undefined {
  const session = req.session;
  const pCookieId = req.signedCookies?.["ride-p-uid"] ? parseInt(req.signedCookies["ride-p-uid"]) : undefined;
  const mCookieId = req.signedCookies?.["ride-m-uid"] ? parseInt(req.signedCookies["ride-m-uid"]) : undefined;
  if (role === "mitra") return session?.mitraId || mCookieId;
  if (role === "pengguna") return session?.penggunaId || pCookieId;
  if (role === "merchant") return session?.merchantId;
  return undefined;
}

// GET /api/push/prefs?role=pengguna|mitra — preferensi notifikasi akun untuk peran tsb
router.get("/prefs", async (req, res) => {
  const userId = userIdForRole(req, req.query?.role as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const [u] = await db.select({ notifPrefs: usersTable.notifPrefs })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return res.json({ prefs: u?.notifPrefs ?? {} });
});

// PUT /api/push/prefs?role=pengguna|mitra — simpan preferensi notifikasi akun untuk peran tsb
router.put("/prefs", async (req, res) => {
  const userId = userIdForRole(req, req.query?.role as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const prefs = req.body?.prefs;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return res.status(400).json({ error: "Invalid prefs" });
  }
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prefs)) clean[k] = Boolean(v);
  await db.update(usersTable).set({ notifPrefs: clean }).where(eq(usersTable.id, userId));
  return res.json({ ok: true, prefs: clean });
});

// GET /api/push/notifications?role=pengguna|mitra — feed notifikasi (lonceng)
router.get("/notifications", async (req, res) => {
  const userId = userIdForRole(req, req.query?.role as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const rows = await db.select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  const [{ value: unread } = { value: 0 }] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
  return res.json({ notifications: rows, unread });
});

// POST /api/push/notifications/read?role=pengguna|mitra — tandai sudah dibaca
// Body opsional { id } untuk satu notifikasi; tanpa id = tandai semua.
router.post("/notifications/read", async (req, res) => {
  const userId = userIdForRole(req, req.query?.role as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.body?.id;
  if (typeof id === "number") {
    await db.update(notificationsTable).set({ read: true })
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.id, id)));
  } else {
    await db.update(notificationsTable).set({ read: true })
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
  }
  return res.json({ ok: true });
});

// Kirim push notification ke satu atau banyak userId
export async function sendPushToUsers(
  userIds: number[],
  payload: { title: string; body: string; url?: string; icon?: string },
  category?: string,
) {
  if (userIds.length === 0) return;
  try {
    let targetIds = userIds;
    // Hormati preferensi notifikasi pengguna. Hanya kategori yang punya toggle
    // (pesanan/chat/promo) yang difilter; tanpa kategori = selalu dikirim
    // (mis. notifikasi akun/keuangan yang kritis).
    if (category) {
      const rows = await db.select({ id: usersTable.id, notifPrefs: usersTable.notifPrefs })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds));
      const disabled = new Set(
        rows.filter(r => (r.notifPrefs as Record<string, boolean> | null)?.[category] === false).map(r => r.id),
      );
      targetIds = userIds.filter(id => !disabled.has(id));
      if (targetIds.length === 0) return;
    }

    // Simpan notifikasi ke feed (lonceng) untuk setiap penerima — berfungsi
    // walau push browser tidak aktif, sehingga riwayat notifikasi selalu lengkap.
    try {
      await db.insert(notificationsTable).values(
        targetIds.map(uid => ({
          userId: uid,
          title: payload.title,
          body: payload.body,
          url: payload.url ?? null,
          category: category ?? null,
        })),
      );
    } catch (e) {
      console.error("[push] failed to persist notifications:", e);
    }

    if (!PUSH_ENABLED) return;
    const subs = await db.select()
      .from(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.userId, targetIds));
    const data = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, data)
          .catch(async (err) => {
            // Hapus subscription yang expired/invalid
            if (err.statusCode === 410 || err.statusCode === 404) {
              await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
            }
            throw err;
          })
      )
    );
    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    if (sent > 0 || failed > 0) console.info(`[push] sent=${sent} failed=${failed} to userIds=${userIds.join(",")}`);
  } catch (e) {
    console.error("[push] sendPushToUsers error:", e);
  }
}

export default router;
