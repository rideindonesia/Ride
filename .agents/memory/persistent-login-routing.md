---
name: Persistent login routing (RIDE)
description: How the splash decides where to send an already-logged-in user, and the multi-role session gotcha.
---

# Persistent login routing

Server sessions already persist (express-session + PgSession, cookie maxAge 1 year, rolling). Login "not sticking" after app reopen was a **frontend routing bug**, not a session bug: the splash sent users to `/login` even when `/auth/me` succeeded.

**Rule:** on app open, if `/auth/me` succeeds, route to the dashboard by role; only route to `/login` on 401.

**Multi-role gotcha:** `GET /api/auth/me` with no `role` query param returns whichever session exists, **preferring pengguna** (`penggunaId ?? mitraId`). Login does NOT clear the other role's session, so one device can hold both. To route deterministically, the frontend stores the last logged-in role in `localStorage["ride-last-role"]` (set on login, cleared on logout) and the splash prefers it over the ambiguous `/me` role.

**Why:** without the stored role, a device with both sessions always lands on the pengguna dashboard even when the user last used mitra.

**How to apply:** keep `ride-last-role` set/cleared in lockstep with login/logout across both dashboards; dashboards still independently re-validate via `/api/auth/me?role=...`.
