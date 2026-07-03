---
name: GoFood merchant/warung 3-party flow
description: How the merchant (warung) role fits into the gofood order state machine and money model
---

# GoFood merchant/warung role

RIDE gofood has a 4th role: **merchant** (warung). Login role `merchant` → `session.merchantId`; owner user has `role='merchant'` linked to a `merchants` row via `ownerUserId`. Owner auto-joins socket room `user:{ownerUserId}`.

## Order state machine (3 parties)
- `merchantStatus` column on orders: `menunggu` → `diterima` → `siap` → (`ditolak` cancels).
- Warung: accept (menunggu→diterima), ready (diterima→siap), reject.
- **Hard gate (server-enforced in mitra.ts phase endpoint):** ojol/mitra CANNOT advance gofood order to phase `pengerjaan` (mengantar) until `merchantStatus==='siap'` → returns 409. Never rely on frontend-only gating.
- Events: `merchant:order:new` (to warung on order create), `order:merchant_status` (to pengguna+mitra+order room on accept/ready/reject).

## Money model (server-authoritative — do NOT trust client)
- **`foodTotal` MUST be recomputed from DB `menu_items` at order creation**, matching each item by id (fallback name) for the given merchantId. Ignore client-submitted `orderItems[].price`; reject unknown/unavailable items. **Why:** client can tamper prices to lower the talangan/total — a fraud vector caught in review.
- Ojol *talangi* (advances) foodTotal; reimbursed by pengguna at payment. payment-data for gofood forces `biayaJasa=0`, `biayaSparepart=foodTotal` (server override, ignores body).
- `platformFee = round(callFee*feePct) + layanan` — UNCHANGED for gofood.

## Recovery
Pengguna `/orders/:id` and `/active-order` must include `merchantStatus`/`foodTotal`/`orderItems` so UI restores warung prep status after refresh/reconnect (socket events alone are not enough).

## Admin
`/admin/merchant-applications[/:email][/status]` — approve creates user+merchants row. Strip `passwordHash` from responses.

## ride-admin note
There is a pre-existing `Merchant.tsx` (menu CRUD) at `/merchant`. The warung *approval* page is separate: `Warung.tsx` at `/warung`.
