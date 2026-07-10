---
name: Railway (single-server) deploy
description: How to deploy this multi-artifact monorepo to Railway as ONE Node service.
---

# Railway single-server deploy

The app is 3 artifacts (api-server `/api`, ride-splash `/`, ride-admin `/admin/`). On Replit a proxy routes each separately. Railway runs only ONE service, so everything must be served by the api-server.

**Key fact:** api-server ALREADY serves the frontends in production — `app.ts` serves `process.cwd()/public` at `/` and `process.cwd()/public/admin` at `/admin/` with SPA fallback (also `/.well-known/assetlinks.json` for the Android TWA). This serving is NOT gated by NODE_ENV; on Replit it's just bypassed by the proxy. So NO backend code change is needed for Railway — only build packaging.

**What Railway needs (see `railway.json` + root `build:railway`/`start:railway` scripts):**
- Build all 3, then place frontends into repo-root `./public` and `./public/admin` (where api-server reads them from cwd).
- Vite configs REQUIRE `PORT` and `BASE_PATH` env at BUILD time (they throw if missing). Build splash with `BASE_PATH=/`, admin with `BASE_PATH=/admin/`.
- Frontends call the API same-origin (`admin lib/api.ts` hardcodes `/api`; splash uses base-derived `/api`), so single-origin serving just works.

**Gotchas:**
- **NODE_ENV=production strips devDeps.** Build tools (vite, esbuild, tailwind, @replit/* vite plugins) are devDependencies. `build:railway` runs `pnpm install --prod=false` first so they're present even though the Railway env has NODE_ENV=production.
- Do NOT use root `pnpm run build` for Railway — it runs `typecheck` first, which fails on pre-existing leaf typecheck debt. `build:railway` skips typecheck (vite/esbuild bundle from source; lib exports point to `src/*.ts` so libs need no pre-build).
- DB URL: code reads `NEON_DATABASE_URL` first, then `DATABASE_URL`.
- `/public` is gitignored (rebuilt fresh); the per-artifact `dist/` dirs are un-ignored/committed.
- Fresh DB: push drizzle schema, then `POST /api/seed/demo` (admin+demo) and `POST /api/seed/admin` (tarif). Uploads are ephemeral on Railway — rely on Cloudinary.
