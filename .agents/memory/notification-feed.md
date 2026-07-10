---
name: Notification feed (bell)
description: How the in-app notification feed relates to web-push delivery in RIDE.
---
The in-app notification feed (bell icon) and web-push are decoupled.

**Rule:** `sendPushToUsers` (api-server push.ts) persists a `notifications` row
for every pref-filtered recipient BEFORE attempting web-push, and the
`if (!PUSH_ENABLED) return` early-return sits AFTER the insert.

**Why:** the feed must always populate even when VAPID/web-push is disabled or a
user never granted browser notification permission. Push is best-effort delivery;
the feed is the source of truth the user actually opens.

**How to apply:** any new notification trigger should call `sendPushToUsers` (do
NOT insert into `notifications` directly + separately call push) so feed + push
stay in lockstep and pref-category filtering applies once. Feed endpoints are
role-aware (`?role=pengguna|mitra` via userIdForRole) per the dual-role rule.
Unread badge uses a separate COUNT query, not the latest-50 feed slice.

## Mitra bell merge strategy
The Mitra dashboard bell merges TWO sources in `notifs`:
- Server feed rows keyed `srv-<id>` (persisted, source of truth).
- Local-only self-action confirmations (accept/reject/done) keyed `Date.now()`.

**Rule:** events the backend already persists to the feed (incoming order,
payment confirmed, cancel-by-pengguna, chat) must NOT also call the local
`pushNotif` — trigger a delayed `fetchNotifs()` instead. Only client-side
self-actions (mitra tapping its own buttons) stay local.

**Why:** a server-persisted event that is also pushed locally produces a
duplicate bell entry (one `srv-` + one local). Partitioning by id prefix lets
each refetch replace all `srv-` items without wiping local self-action items.
