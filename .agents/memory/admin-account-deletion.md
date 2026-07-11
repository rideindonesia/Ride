---
name: Admin account deletion (hard delete + FK cascade)
description: How admin hard-deletes pengguna/mitra accounts, and the FK ordering it must follow.
---

# Admin account deletion

Admin can hard-delete pengguna and mitra accounts (separate from the existing
`isSuspended` soft-block). Endpoints: `DELETE /admin/pengguna/:id`,
`DELETE /admin/mitra/:email`. Both `requireAdmin`, wrapped in `db.transaction`,
guarded to refuse `isAdmin` rows and to verify `role` matches the endpoint
(deleting a mitra through the pengguna path would wrongly delete orders instead
of nulling them).

**Pengguna delete is irreversibly destructive:** `orders.penggunaId` is a
**notNull FK**, so there is no way to keep a consumer's order history when
deleting them — their orders (and the chat on those orders) MUST be deleted.
This also removes that revenue from keuangan/laporan reports. The UI states this
in the confirm dialog. If the goal is only to block, use Suspend, not Delete.

**Mitra delete preserves consumer history:** `orders.mitraId` is a **nullable
FK**, so set it null (don't delete the order — it belongs to the pengguna).
`platform_fee_payments.mitraId` and `mitra_locations.userId` are notNull FKs → delete those rows.

**FK delete ordering that actually matters (children before parents):**
- `chat_messages` (FKs: `orderId` notNull, `senderId` notNull) must be deleted
  BEFORE the orders and BEFORE the user. For pengguna: delete chats by the
  user's orderIds, then orders, then user.
- Non-FK integer columns (no constraint, cleaned only for hygiene, order
  irrelevant): notifications, push_subscriptions, login_history,
  user_addresses, voucher_usage, reports, merchants.ownerUserId.

**Why:** getting the order wrong throws a Postgres FK violation and (inside the
transaction) rolls the whole delete back — the account won't delete at all.

Broadcast (`POST /admin/broadcast`) targets: all | pengguna | mitra | merchant
(merchant = users with `role='merchant'`).
