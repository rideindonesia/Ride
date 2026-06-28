---
name: Payment / platform-fee amount integrity
description: Which money values in the order flow are server-authoritative vs client-supplied, and why
---

# Payment / platform-fee amount integrity

In the mitra→pengguna payment handshake, the server must NOT trust money values
that determine billing or platform fee from the request body.

**Server-authoritative (recompute / read from DB, ignore client):**
- `biayaPanggilan` (call fee) — computed and stored on the order's `totalAmount`
  at **accept** time (from DB tariffs + haversine distance). Reuse that stored
  value at `payment-data`, do NOT take it from the request body.
- `biayaLayanan` — read `biaya_layanan_admin` from `system_settings`.
- `platform_fee_pct` — read from `system_settings`; `platformFee =
  round(callFee * pct) + biayaLayanan`.
- `total` — recompute = jasa + sparepart + callFee + biayaLayanan.

**Legitimately client-supplied (the mitra's real inputs):**
- `biayaJasa`, `biayaSparepart`, `paymentMethod` (clamp negatives to 0).

**Why:** a malicious mitra could send a lower `biayaPanggilan` to underpay
RIDE's platform fee, or alter what the pengguna is billed. Found in the
pengguna/mitra logic audit. Mirrors the no-hardcode + server-validates rules.

**How to apply:** any new endpoint that accepts amounts feeding fees, payouts,
or platform revenue must recompute from server-trusted sources (DB tariffs,
stored order fields) rather than echoing client-sent numbers.
