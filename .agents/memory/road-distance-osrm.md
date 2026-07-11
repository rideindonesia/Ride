---
name: Road distance (OSRM) everywhere
description: How RIDE measures travel distance — must follow the road (OSRM), not straight-line haversine — across server fares and every client page.
---

# Jarak harus mengikuti jalan (OSRM), bukan garis lurus (haversine)

**Rule:** Any distance used for a FARE or shown to the user as a travel distance must be OSRM road distance, with haversine only as a fallback when OSRM fails/timeouts. Haversine straight-line is acceptable ONLY for: (a) geofence/radius checks (ORDER_RADIUS_KM), and (b) live per-tick tracking of a moving mitra (calling OSRM every GPS tick would hammer the free public server).

**Why:** User flagged straight-line distances as "sangat fatal" — the fare/shown km was shorter than the real road route, so quotes were wrong.

## Where road distance is computed
- **Server (authoritative fare):** `pengguna.ts roadDistanceKm()` precomputes `orders.tripDistanceKm` at creation for trip verticals; `mitra.ts serverRoadDistanceKm()` at accept — trip = pickup→dest, on-site = mitra→pickup. Both OSRM + haversine fallback. This is the money path and is already correct.
- **Client trip pages** (OrderTrip = goride/gocar/gosend/goshop, OrderFood = gofood): fetch OSRM inline for the estimate + blue polyline; haversine only while route loads.
- **Client on-site pages** (bengkel/barber/cuci/elektronik/inspeksi/towing): use shared `roadDistanceKm()` from `utils/pricing.ts`. Pattern at each accept site (resume-order effect + poll/socket handler): set `acceptedMitra` instantly with haversine, then fire-and-forget `roadDistanceKm(...).then(km => setAcceptedMitra(prev => prev && prev.id===id ? {...prev, dist:km, etaMin} : prev))` to upgrade the displayed distance/ETA. The `prev.id===` guard prevents stale async writes.

**How to apply:** New order/service page → import `roadDistanceKm` from `utils/pricing.ts` for any displayed travel distance; never introduce a new haversine-based fare/display. `roadDistanceKm` guards non-finite coords (falls back, never throws), caches by rounded coords for 60s. Public OSRM `router.project-osrm.org` is used everywhere (verified reachable ~0.4s from Replit + Railway); if it ever gets rate-limited in prod, swap the base URL in the server helpers + `pricing.ts` + the inline trip-page fetches (kept in sync, not fully centralized).
