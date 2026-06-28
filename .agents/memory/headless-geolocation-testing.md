---
name: Testing mitra GPS / geolocation flows
description: Why mitra location/ETA features can't be verified with curl or headless browsers, and how to validate them instead
---

# Testing mitra GPS / geolocation flows

The mitra "menuju" flow depends on `navigator.geolocation` (getCurrentPosition +
watchPosition). curl and most headless/e2e browsers can't drive it:

- Playwright `getCurrentPosition` rejects (or hangs) even when permission is set
  to `granted`, so only the GPS-denied branch (the `gpsBlocked` overlay) is
  actually e2e-testable.
- Always give `getCurrentPosition` a hard timeout so a never-firing
  success/error callback can't wedge the flow.

**How to validate instead:**
- Verify the throttle logic by reading code (location PATCH gated to max 1 / 8s
  via a `lastLocSentRef` timestamp), not by driving real GPS.
- Hit `PATCH /api/mitra/location` directly with curl to test the server side.
- Manual device testing is the only true e2e for the live tracking + ETA UI.

**Why:** avoids wasting time trying to script real GPS in CI/headless runs.
