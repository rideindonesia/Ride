---
name: In-app notification delivery per role (pengguna/mitra/warung)
description: How notifications reach each role's dashboard, and the warung/merchant bell gap.
---

# In-app notification delivery per role

`sendPushToUsers(userIds, payload, category?)` (api-server `routes/push.ts`) always
persists a row to the `notifications` table (the "lonceng"/bell feed) keyed by userId,
and additionally sends a browser web-push if the user has a subscription. So delivery
BY userId always works; the question is whether the target role's frontend can READ it.

**Who can actually see the bell feed today:**
- **pengguna** → `DashboardPengguna`, fetches `/api/push/notifications?role=pengguna`. ✅
- **mitra** → `DashboardMitra`, fetches `/api/push/notifications?role=mitra`. ✅
- **warung (merchant)** → `DashboardMerchant` only calls `usePushNotification(true)`
  (browser push subscribe). It has **NO bell-feed UI** and never fetches
  `/api/push/notifications`. So stored notifications for a merchant userId are invisible
  in-app; the warung only gets a browser push IF already subscribed.

**Cross-role session gotcha:** a warung logs in through the Mitra login form
(`role='mitra'` in the request), but their `user.role === 'merchant'`, so the login
handler sets `session.merchantId` (NOT `mitraId`) and the frontend redirects to
`/dashboard/merchant`. `userIdForRole()` in push.ts must therefore handle
`role==='merchant' → session.merchantId` for any merchant notification read to work.

**Delivery timing:** account-approval notifications are created at approve time, BEFORE
the applicant has ever logged in, so there is no push subscription yet — they can only
be seen via the persisted bell feed on next login (not via live browser push).

**Reject has no account:** rejected/pending mitra & warung have no `users` row, so they
cannot log in. Their status is surfaced at the login attempt instead: in auth.ts
`POST /login`, when no user matches for `role='mitra'`, it looks up
mitra_applications + merchant_applications by identifier AND passwordHash and returns a
403 with a pending/rejected message.
