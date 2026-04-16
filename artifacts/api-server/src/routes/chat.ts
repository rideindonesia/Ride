import { Router } from "express";
import { db, chatMessagesTable, ordersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { io } from "../socket";

const router = Router();

/**
 * Collect all verified user IDs from this request.
 * On a same-device test with multiple accounts, both a pengguna cookie and a mitra
 * cookie (and/or a session) may be present simultaneously.  Instead of picking just
 * one winner, we return the full set so callers can check whether ANY identity is
 * authorised for the target order.
 */
function getAllUserIds(req: any): Set<number> {
  const ids = new Set<number>();

  const sessionUid = (req.session as any)?.userId;
  if (sessionUid) {
    const n = Number(sessionUid);
    if (!isNaN(n) && n > 0) ids.add(n);
  }

  const pUid = req.signedCookies?.["ride-p-uid"];
  if (pUid && pUid !== false) {
    const n = parseInt(pUid);
    if (!isNaN(n) && n > 0) ids.add(n);
  }

  const mUid = req.signedCookies?.["ride-m-uid"];
  if (mUid && mUid !== false) {
    const n = parseInt(mUid);
    if (!isNaN(n) && n > 0) ids.add(n);
  }

  return ids;
}

// Auth guard — at least one verified identity must exist
function requireAuth(req: any, res: any, next: any) {
  if (getAllUserIds(req).size === 0) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// GET /api/chat/:orderId — fetch messages
router.get("/:orderId", requireAuth, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db.select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

  const ids = getAllUserIds(req);
  if (!order || (!ids.has(order.penggunaId) && !ids.has(order.mitraId ?? -1))) {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }

  const messages = await db.select({
    id: chatMessagesTable.id,
    senderId: chatMessagesTable.senderId,
    senderRole: chatMessagesTable.senderRole,
    message: chatMessagesTable.message,
    createdAt: chatMessagesTable.createdAt,
  }).from(chatMessagesTable)
    .where(eq(chatMessagesTable.orderId, orderId))
    .orderBy(asc(chatMessagesTable.createdAt));

  res.json({ messages });
});

// POST /api/chat/:orderId — send message
router.post("/:orderId", requireAuth, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const { message } = req.body;

  if (isNaN(orderId) || !message?.trim()) {
    res.status(400).json({ error: "Data tidak valid" }); return;
  }

  const [order] = await db.select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

  const ids = getAllUserIds(req);
  if (!order || (!ids.has(order.penggunaId) && !ids.has(order.mitraId ?? -1))) {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }

  // Determine senderRole using active SESSION first (most reliable),
  // then fall back to signed cookies for cases without an active session.
  const sessionUserId = (req.session as Record<string, unknown>).userId as number | undefined;
  const sessionRole   = (req.session as Record<string, unknown>).userRole as string | undefined;

  let senderId: number;
  let senderRole: "pengguna" | "mitra";

  if (sessionRole === "mitra" && sessionUserId === order.mitraId) {
    senderId    = sessionUserId;
    senderRole  = "mitra";
  } else if (sessionRole === "pengguna" && sessionUserId === order.penggunaId) {
    senderId    = sessionUserId;
    senderRole  = "pengguna";
  } else {
    // Fallback: signed cookies (no active session, e.g. SSO/cookie-only flow)
    const mUidRaw = req.signedCookies?.["ride-m-uid"];
    const mUid    = mUidRaw && mUidRaw !== false ? parseInt(mUidRaw) : NaN;
    const pUidRaw = req.signedCookies?.["ride-p-uid"];
    const pUid    = pUidRaw && pUidRaw !== false ? parseInt(pUidRaw) : NaN;

    if (!isNaN(mUid) && mUid === order.mitraId) {
      senderId = mUid; senderRole = "mitra";
    } else if (!isNaN(pUid) && pUid === order.penggunaId) {
      senderId = pUid; senderRole = "pengguna";
    } else {
      res.status(403).json({ error: "Tidak dapat menentukan pengirim" }); return;
    }
  }

  const [msg] = await db.insert(chatMessagesTable).values({
    orderId,
    senderId,
    senderRole,
    message: message.trim(),
  }).returning({ id: chatMessagesTable.id, createdAt: chatMessagesTable.createdAt });

  try {
    io?.to(`order:${orderId}`).emit("chat:message", {
      id: msg.id,
      orderId,
      senderId,
      senderRole,
      message: message.trim(),
      createdAt: msg.createdAt,
    });
  } catch {}

  res.json({ ok: true, messageId: msg.id, senderRole });
});

export default router;
