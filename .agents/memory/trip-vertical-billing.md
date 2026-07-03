---
name: Trip-vertical billing distance
description: goride/gocar/gosend/goshop/gofood are billed on pickup→destination distance with no free km, unlike the on-site services.
---
The Gojek-style verticals (goride, gocar, gosend, goshop, gofood) are "trip" services: the call fee is charged over the pickup→destination distance with `freeKm: 0`. The original on-site services (bengkel/elektronik/cuci/barber/inspeksi) charge over the mitra→pickup distance with a free-km allowance; towing is a trip service too (pickup→dest) but keeps free km.

**Why:** A/B transport & courier fares must reflect the passenger/parcel journey, not how far the mitra travels to reach pickup. Getting this wrong makes the mitra's pre-accept fee preview disagree with the backend-computed fare.

**How to apply:** Anywhere a call fee is computed for a trip vertical, use the pickup→destination distance (`tripDistanceKm` on the order, or haversine(pickup,dest)) — NOT mitra→pickup. `isTripService()` / `TRIP_SERVICES` in `ride-splash/src/utils/pricing.ts` and the matching set in `api-server/src/routes/mitra.ts` + `pengguna.ts` are the single source of truth; keep all three in sync. The mitra→pickup distance is only for arrival ETA. Any UI that deep-links to an order (e.g. active-order resume card) must derive the route from `serviceType`, never hardcode `/order/bengkel`.
