---
name: Seed settings gotcha (RIDE)
description: Why system_settings can end up empty and how tarif seeding must stay idempotent
---

# system_settings seeding must be unconditional

**Rule:** In `POST /api/seed/admin`, the `system_settings` (tarif) upsert loop must run on EVERY call, not only when the admin user is freshly created.

**Why:** Originally the settings upsert lived inside the `else` branch (admin-does-not-exist). But `POST /api/seed/demo` creates the admin user first. So a normal seed order (`/demo` then `/admin`) left `system_settings` completely empty — every `call_fee_*` key missing. Frontend `loadTarif()` then silently fell back to hardcoded `CALL_FEE_CONFIG`, violating the no-hardcode rule, and platform-fee/tarif math ran on stale defaults.

**How to apply:** Keep the `settings` array + `onConflictDoNothing()` loop OUTSIDE the create/reset branch. Any new service tarif key (e.g. the 5 Gojek-style verticals: goride/gocar/gosend/goshop/gofood, each `_base` + `_per_km`) is added to that one array; re-run `POST /api/seed/admin` to backfill. Tarif keys are read generically by `/api/pengguna/tarif` and admin GET/PATCH `/settings`, so new keys auto-surface once seeded.

Note: `/api/pengguna/tarif` requires login — curl without a session returns `{"error":"Belum login"}`. Verify tarif via DB query, not anonymous curl.
