---
name: Order geo-locking (radius per wilayah)
description: How orders are locked to a geographic radius so out-of-area mitra can't take them.
---

# Order geo-locking (radius)

Orders are locked to a **25 km radius** between the order's pickup point and the mitra's
location, so a mitra operating in another city cannot see/accept an out-of-area order.
Chosen over city-name matching because order rows store only pickup lat/lng (no clean
city string; Nominatim city text ≠ the CITIES dropdown mitra register with), and radius
needs no prod DB migration.

**Enforced at THREE points — all must stay in sync:**
1. Dispatch (order creation): filter online mitra by haversine(pickup, mitra.location) ≤ radius before socket/push fanout.
2. Polling (mitra incoming-orders): radius filter done **in the SQL WHERE** (haversine expression), NOT after `limit`.
3. Accept guard (PATCH accept): 403 if mitra beyond radius — the real anti-API-bypass control.

**Why radius filter must be in SQL for polling:** the endpoint returns only the single
newest matching order. If you `limit(N)` first then filter in JS, N far newer orders can
hide a nearby one (starvation). Put the distance condition in the query before the limit.

**Missing-coordinates policy = fail-open (consistent across all three):** if pickup or
mitra coords are absent, skip the radius check rather than strand the order. In practice
orders always have pickup lat/lng and online mitra always have location, so the lock is
effectively always enforced; fail-open just avoids stuck orders in the rare null case.

**Radius constant** `ORDER_RADIUS_KM = 25` is duplicated in routes/pengguna.ts and
routes/mitra.ts (matches the codebase's existing "mirror + keep in sync" convention for
geo helpers like zoneFromCoords/serverHaversineKm). Change both together.
