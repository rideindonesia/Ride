---
name: DB URL env gating (dev vs prod)
description: Why NEON_DATABASE_URL is gated behind NODE_ENV==='production' in lib/db and session store
---

# NEON_DATABASE_URL must be gated on NODE_ENV

`lib/db/src/index.ts` (main drizzle pool) and `artifacts/api-server/src/lib/session.ts`
(connect-pg-simple store) resolve their connection string as:
`(NODE_ENV === "production" ? NEON_DATABASE_URL : undefined) || DATABASE_URL`.

**Why:** The production app on Railway uses Neon via `NEON_DATABASE_URL`. But that
same secret can also exist in the Replit dev workspace (e.g. added so the agent can
run read-only prod queries via `psql "$NEON_DATABASE_URL"`). The original code was
`NEON_DATABASE_URL || DATABASE_URL`, which meant *any* presence of the secret made
the **dev** app connect to **production** — a dangerous dev→prod data bleed. Gating on
`NODE_ENV` keeps dev on the local Replit `DATABASE_URL` no matter what secrets exist.

**How to apply:**
- Railway/production must set `NODE_ENV=production` or the app falls back to `DATABASE_URL` (which may be unset there → startup fails). This is intentional/loud.
- Replit dev workflow already exports `NODE_ENV=development`, so it always uses the dev DB.
- Secrets added via `requestSecrets` cannot be removed with `deleteEnvVars` (that only handles non-secret env vars) — so keeping `NEON_DATABASE_URL` around for read-only psql is fine precisely because the code gate neutralizes it in dev.
- Schema changes reach prod automatically through `ensureSchema()` ALTER ... IF NOT EXISTS on startup; no manual prod migration needed.
