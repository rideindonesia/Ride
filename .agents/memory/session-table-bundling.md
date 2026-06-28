---
name: Session table on fresh DB (connect-pg-simple + esbuild)
description: Why express-session saves fail on a fresh DB in this repo, and the fix.
---

# Session table must be created in ensureSchema(), not by connect-pg-simple

The api-server uses `express-session` with `connect-pg-simple` (`store: new PgSession({ createTableIfMissing: true })`). On a fresh database the `session` table does **not** get created, so every `req.session.save()` fails. Most login routes auto-save at end of request and swallow the error silently; only the admin login surfaces it (`{"error":"Gagal menyimpan sesi"}`) because it calls `req.session.save()` with an explicit callback.

**Root cause:** `createTableIfMissing` reads its `table.sql` via `__dirname`. The server is bundled with esbuild (`build.mjs` → `dist/index.mjs`), so `__dirname` points at `dist/` where `table.sql` does not exist. The read fails and the table is never created.

**Fix:** create the `session` table in `ensureSchema()` (`lib/db/src/index.ts`) with raw idempotent DDL (matches connect-pg-simple's schema: `sid varchar pk`, `sess json`, `expire timestamp(6)`, plus `IDX_session_expire`). `ensureSchema()` runs at server startup against the drizzle pool, so it is independent of the bundling problem and works in both dev and production deploys.

**Why:** keeping it in `ensureSchema()` (not relying on the store) means session persistence survives fresh DBs and esbuild bundling on any environment.

**How to apply:** if sessions silently don't persist or admin login returns "Gagal menyimpan sesi" on a new environment, verify `SELECT to_regclass('public.session')` is non-null; if null, ensureSchema didn't run or was reverted.
