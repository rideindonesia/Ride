import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router = Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "BFrF6KXdAWOIqMj7YEDUtP3BTLP6P4va5EdhFH30rbqU_EILexcnd4EzI1yXlnrEDSbOyp5AIYW_uLO-10fVSDk";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "WHVgIPvc_31N5JwxzvHqnJ8bLe08AVuzQfJVwQIqlcA";

webpush.setVapidDetails("mailto:admin@ride.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// GET /api/push/vapid-public-key
router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
router.post("/subscribe", async (req, res) => {
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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// DELETE /api/push/unsubscribe
router.delete("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "No endpoint" });
  try {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// Kirim push notification ke satu atau banyak userId
export async function sendPushToUsers(userIds: number[], payload: { title: string; body: string; url?: string; icon?: string }) {
  if (userIds.length === 0) return;
  try {
    const subs = await db.select()
      .from(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.userId, userIds));
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
