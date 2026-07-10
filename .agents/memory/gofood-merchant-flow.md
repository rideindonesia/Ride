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

## Warung is merged INTO Mitra at the UI/login layer (not the data model)
- Role-select shows only **Pengguna + Mitra** (no standalone Warung card). Warung is a service option ("Warung / Makanan") inside Mitra registration that redirects to the dedicated warung apply form (`?role=merchant`, RegisterMerchant) — warung needs shop data + shop photo, so it keeps its own form.
- **Warung logs in through the Mitra login form (phone-based).** Backend `/api/auth/login`: when `role='mitra'`, match `role IN (mitra, merchant)`; the approved-merchant gate + real-role response are unchanged, so frontend still routes merchants to `/dashboard/merchant`.
- **Why the data model stays 4-role:** the account is still `role='merchant'` with a `merchants` row; only the entry points (register card + login form) were merged. Keeps admin approval, order flow, and dashboards intact.
- **Login must select the candidate by matching password hash, NOT `limit(1)`.** A mitra and a warung can share a phone/email (merchant apply only enforces *email* uniqueness), so `OR(email/phone) + IN(mitra,merchant) + limit(1)` can return the wrong row and block a valid login. Fetch candidates, then `.find(u => u.passwordHash === hash)`.
- **Account data must NOT be entered twice.** The Mitra registration collects owner name/phone/email/password before the service picker; the Warung form ALSO opens with a "Data Pemilik & Akun" step → duplicate entry. Fix: hand the mitra account data to the warung form via an in-memory module (`lib/warungHandoff.ts`, consumed once on mount), which prefills owner fields and starts the warung form at its "Data Warung" step (dynamic step count). **Why:** users complained about re-typing the same account data. Keep this handoff whenever the Mitra→Warung entry path changes.
- **Wouter same-path navigation gotcha:** navigating between two views that share a pathname but differ only by query string (e.g. `/register/form?role=mitra` → `?role=merchant`) does NOT re-render — wouter tracks pathname only. Give each destination a distinct path (warung uses `/register/merchant`).

## Note
`merchants.status` column DEFAULTs to `'approved'` in the migration — rely on the login gate (row must exist) rather than the default to keep unapproved accounts out.
