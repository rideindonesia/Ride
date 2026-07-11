---
name: Road distance (OSRM) everywhere
description: How RIDE measures travel distance — must follow the road (OSRM), not straight-line haversine — across server fares and every client page.
---

# Jarak harus mengikuti jalan (OSRM), bukan garis lurus (haversine)

**Rule:** Any distance used for a FARE or shown to the user as a travel distance must be OSRM road distance. When OSRM fails, NEVER fall back to raw straight-line — use a road ESTIMATE = `haversine × ROAD_DETOUR_FACTOR (1.4)`. Road helpers retry OSRM once before falling back. Haversine straight-line is acceptable RAW ONLY for: (a) geofence/radius checks (ORDER_RADIUS_KM), and (b) as the un-factored base inside the estimate helper itself.

**Why:** User escalated: raw straight-line is shorter than the real road route, so it UNDERPAYS drivers ("merugikan driver"). A factored estimate over-estimates slightly (city road/straight ratio ~1.3–1.4), so a fallback never shorts the driver. Geofence stays RAW haversine on purpose: straight-line ≤ road, so the driver sees MORE nearby orders (driver-generous) and it never determines pay — converting it to OSRM would need N calls per poll AND show drivers fewer orders.

**ROAD_DETOUR_FACTOR = 1.4** is duplicated as a local const in each of: server `pengguna.ts` + `mitra.ts` (fare fallback), client `utils/pricing.ts` (exported, + `roadEstimateKm()` helper), `DashboardMitra.tsx` (display helpers `haversineKmMitra`/`haversineDist` baked the factor into their return), and all 8 order pages' top-level `haversineDist` (on-site `calcDist` now just delegates to it). To retune, change all of them. Client haversine is display-only everywhere (no thresholds), so baking the factor into the base display helpers is safe; server base haversine is NOT factored because geofence depends on it.

## Where road distance is computed
- **Server (authoritative fare):** `pengguna.ts roadDistanceKm()` precomputes `orders.tripDistanceKm` at creation for trip verticals; `mitra.ts serverRoadDistanceKm()` at accept — trip = pickup→dest, on-site = mitra→pickup. Both OSRM + haversine fallback. This is the money path and is already correct.
- **Client trip pages** (OrderTrip = goride/gocar/gosend/goshop, OrderFood = gofood): fetch OSRM inline for the estimate + blue polyline; haversine only while route loads.
- **Client on-site pages** (bengkel/barber/cuci/elektronik/inspeksi/towing): use shared `roadDistanceKm()` from `utils/pricing.ts`. Pattern at each accept site (resume-order effect + poll/socket handler): set `acceptedMitra` instantly with haversine, then fire-and-forget `roadDistanceKm(...).then(km => setAcceptedMitra(prev => prev && prev.id===id ? {...prev, dist:km, etaMin} : prev))` to upgrade the displayed distance/ETA. The `prev.id===` guard prevents stale async writes.

**How to apply:** New order/service page → import `roadDistanceKm` from `utils/pricing.ts` for any displayed travel distance; never introduce a new haversine-based fare/display. `roadDistanceKm` guards non-finite coords (falls back, never throws), caches by rounded coords for 60s. Public OSRM `router.project-osrm.org` is used everywhere (verified reachable ~0.4s from Replit + Railway); if it ever gets rate-limited in prod, swap the base URL in the server helpers + `pricing.ts` + the inline trip-page fetches (kept in sync, not fully centralized).
