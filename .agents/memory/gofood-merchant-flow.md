---
name: GoFood merchant/warung role — durable decisions
description: Non-obvious rules & trust boundaries for the merchant (warung) role in the gofood vertical
---

# GoFood merchant/warung — durable decisions

RIDE gofood has a 4th role: **merchant** (warung). These are the non-obvious rules that are easy to get wrong; mechanics/endpoint names are discoverable in code.

## Onboarding is admin-gated — enforce server-side (fraud/trust boundary)
- Warung accounts must go through **apply → pending → admin approve** only. Admin approval is what creates the `merchants` row (status `approved`) linked by `ownerUserId`.
- **Generic `/api/auth/register` must reject `role=merchant`** (403), and **`/api/auth/login` for a merchant must require an approved `merchants` row** (403 otherwise). A self-registered merchant has no merchants row → login blocked.
- **Why:** a code review REJECTED the first cut because register/login accepted merchants directly, bypassing verification. Frontend-only gating is insufficient.

## Money is server-authoritative (fraud boundary)
- **`foodTotal` MUST be recomputed from DB `menu_items`** at order create (match by id, fallback name, for that merchantId). Ignore client `orderItems[].price`; reject unknown/unavailable items. **Why:** client can tamper prices to shrink the ojol *talangan* — caught in review.
- Ojol *talangi* (advances) foodTotal, reimbursed by pengguna at payment: gofood payment-data forces `biayaJasa=0`, `biayaSparepart=foodTotal` server-side (ignores body). `platformFee` formula UNCHANGED.

## Order state machine gate
- `orders.merchant_status`: `menunggu`→`diterima`→`siap` (`ditolak` cancels). **Ojol cannot advance a gofood order to delivery phase until `merchant_status='siap'` — enforced server-side (409), not frontend-only.**
- Pengguna/mitra recovery endpoints must return `merchantStatus`/`foodTotal`/`orderItems` so UI restores warung prep state after refresh (socket events alone insufficient).

## Note
`merchants.status` column DEFAULTs to `'approved'` in the migration — rely on the login gate (row must exist) rather than the default to keep unapproved accounts out.
