---
name: Dual-role identity resolution
description: Why per-account RIDE endpoints must resolve userId strictly by role, not session.penggunaId||mitraId
---

# Dual-role identity resolution (RIDE)

One device/session can be logged in as BOTH a Pengguna and a Mitra at once
(common during same-device testing, and possible in production). Session carries
both `penggunaId` and `mitraId`; login does not clear the other role. There are
also signed cookies `ride-p-uid` and `ride-m-uid`.

**Rule:** Any endpoint that reads/writes per-account data (notification prefs,
profile, wallet, etc.) must resolve the user id *strictly for the requesting
role* — e.g. accept a `?role=pengguna|mitra` param (or a role token) and pick
`session.mitraId || ride-m-uid` vs `session.penggunaId || ride-p-uid`
accordingly. Reject if that role's identity is absent.

**Why:** A resolver like `session.penggunaId || session.mitraId || ...` always
prefers pengguna when both exist, so the Mitra dashboard ends up
reading/writing the Pengguna account's data — silent cross-account corruption.

**How to apply:** When adding/reviewing any RIDE route that touches one specific
account's data, confirm it is role-scoped, not "first id wins". This is the same
class of bug as the chat cross-role 403 fix noted in replit.md.
