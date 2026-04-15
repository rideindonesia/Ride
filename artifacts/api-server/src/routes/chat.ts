import { Router } from "express";
import { db, chatMessagesTable, ordersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

/** Get userId from signed role cookies or session (handles same-device cross-role login) */
function getAnyUserId(req: any): number | null {
  const pUid = req.signedCookies?.["ride-p-uid"];
  const mUid = req.signedCookies?.["ride-m-uid"];
  const sessionUid = (req.session as any)?.userId;
  // Session wins (most recent login), then pengguna cookie, then mitra cookie
  if (sessionUid) return sessionUid as number;
  if (pUid) { const n = parseInt(pUid); if (!isNaN(n)) return n; }
  if (mUid) { const n = parseInt(mUid); if (!isNaN(n)) return n; }
  return null;
}

// Auth guard — either pengguna or mitra
function requireAuth(req: any, res: any, next: any) {
  if (!getAnyUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// GET /api/chat/:orderId — fetch messages
router.get("/:orderId", requireAuth, async (req, res) => {
  const userId = getAnyUserId(req) as number;
  const orderId = parseInt(req.params.orderId);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  // Verify this user is either pengguna or mitra for this order
  const [order] = await db.select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

  if (!order || (order.penggunaId !== userId && order.mitraId !== userId)) {
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
  const userId = getAnyUserId(req) as number;
  const userRole = (req.session as any)?.role as string;
  const orderId = parseInt(req.params.orderId);
  const { message } = req.body;

  if (isNaN(orderId) || !message?.trim()) {
    res.status(400).json({ error: "Data tidak valid" }); return;
  }

  // Verify access
  const [order] = await db.select({ penggunaId: ordersTable.penggunaId, mitraId: ordersTable.mitraId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

  if (!order || (order.penggunaId !== userId && order.mitraId !== userId)) {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }

  // Determine role
  const senderRole = order.penggunaId === userId ? "pengguna" : "mitra";

  const [msg] = await db.insert(chatMessagesTable).values({
    orderId,
    senderId: userId,
    senderRole,
    message: message.trim(),
  }).returning({ id: chatMessagesTable.id, createdAt: chatMessagesTable.createdAt });

  res.json({ ok: true, messageId: msg.id, senderRole });
});

export default router;
