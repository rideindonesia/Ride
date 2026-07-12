---
name: Ride motor/ojek zone pricing policy
description: Business decision on RIDE's motor/kurir zone tariff vs Maxim, and the 3 code locations that must stay in sync when it changes.
---

Owner's pricing policy (set 2026-07-12): RIDE's per-zone motor tariff (used by goride/gosend/goshop/gofood, shared config) should stay **Rp1,000–1,200 cheaper than Maxim** for the same trip — not cheaper than that. It was previously undercutting Maxim by ~Rp3,000+ on a real Balikpapan (Zone III) comparison, which the owner said hurts mitra (partner) earnings. Fixed by raising the per-zone **base fee only** (the flat amount covering the first `MOTOR_FREE_KM`), leaving per-km rates untouched — owner explicitly asked to raise base, not per-km.

Current base fees (as of 2026-07-12): Zone I Rp11,000, Zone II (Jabodetabek) Rp12,200, Zone III Rp11,000. Increase was ~22% applied proportionally to all 3 zones from a single Zone III data point (6.4km: RIDE Rp14,000 vs Maxim Rp17,200) — only Zone III was directly verified against a real Maxim price; Zones I/II were extrapolated, not independently confirmed.

**Why:** owner cares about mitra economics more than winning strictly on price; a small, consistent discount vs Maxim is the target, not being the cheapest option.

**How to apply:** any future motor-zone tariff change must update all 3 synced copies together or the app and backend will disagree:
1. `artifacts/ride-splash/src/utils/pricing.ts` — `MOTOR_ZONE_CONFIG` (frontend default/estimate shown to user)
2. `artifacts/api-server/src/routes/mitra.ts` — `MOTOR_ZONE_DEFAULT` (backend fallback used when `system_settings` has no override)
3. `artifacts/api-server/src/routes/seed.ts` — `motor_zone*_base`/`motor_zone*_per_km` seed rows (what a fresh DB seed writes into `system_settings`, which the admin panel's Pengaturan page then edits)

If `system_settings` already has rows for these keys (check via SQL before assuming seed.ts is authoritative), those DB values win at runtime — update them directly too, not just the code defaults.
