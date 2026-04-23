import { Router } from "express";
import { db, chatMessagesTable, ordersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { io } from "../socket";
import { sendPushToUsers } from "./push";

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

  const pId = (req.session as any)?.penggunaId;
  if (pId) { const n = Number(pId); if (!isNaN(n) && n > 0) ids.add(n); }
  const mId = (req.session as any)?.mitraId;
  if (mId) { const n = Number(mId); if (!isNaN(n) && n > 0) ids.add(n); }

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

  // Determine senderRole from session role-specific keys
  const sessionPenggunaId = (req.session as any)?.penggunaId as number | undefined;
  const sessionMitraId    = (req.session as any)?.mitraId    as number | undefined;

  let senderId: number;
  let senderRole: "pengguna" | "mitra";

  if (sessionMitraId && Number(sessionMitraId) === Number(order.mitraId)) {
    senderId   = sessionMitraId;
    senderRole = "mitra";
  } else if (sessionPenggunaId && Number(sessionPenggunaId) === Number(order.penggunaId)) {
    senderId   = sessionPenggunaId;
    senderRole = "pengguna";
  } else {
    res.status(401).json({ error: "Sesi habis, silakan login ulang" }); return;
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

    // Push notification ke pihak lawan bicara
    const shortMsg = message.trim().slice(0, 80);
    if (senderRole === "mitra" && order.penggunaId) {
      sendPushToUsers([order.penggunaId], {
        title: "💬 Pesan dari Mitra",
        body: shortMsg,
        url: "/",
      });
    } else if (senderRole === "pengguna" && order.mitraId) {
      sendPushToUsers([order.mitraId], {
        title: "💬 Pesan dari Konsumen",
        body: shortMsg,
        url: "/",
      });
    }
  } catch {}

  res.json({ ok: true, messageId: msg.id, senderRole });
});

export default router;
