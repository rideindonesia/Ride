---
name: Ride app optional secrets
description: Which third-party secrets the Ride app's backend expects but were not set after importing the repo into a fresh Replit workspace.
---

After importing `rideindonesia/Ride` into a fresh workspace, `DATABASE_URL` and `SESSION_SECRET` were present/provisioned, but these were NOT set (features silently degrade to dev-mode fallbacks rather than crash, per replit.md notes):

- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — photo/document uploads
- `FONNTE_TOKEN` — WhatsApp OTP delivery (without it, OTP code is returned directly in the API response — dev-mode only, per replit.md)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — web push notifications
- `ADMIN_TOKEN_VERSION` — optional, defaults to "1"

**Why it matters:** don't assume these are configured just because the app boots and the core flows work — request them via `requestSecrets` only when the user actually starts working on the feature that needs them (uploads, OTP, push), not preemptively.
