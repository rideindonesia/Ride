---
name: RIDE deployment targets
description: This app deploys to TWO places — Railway (production) and Replit — keep both buildable
---

RIDE has a live production backend on **Railway** (the Play Store app points at it),
AND is developed/deployed on Replit. Do not assume Replit is the only target.

- Railway builds from the user's GitHub repo (`rideindonesia/Ride`) via `Dockerfile`
  (`railway.toml` → builder = dockerfile). Replit changes only reach Railway after the
  user pushes them to GitHub.
- Single-server production layout: api-server serves both frontends from
  `process.cwd()/public` (splash) and `process.cwd()/public/admin`. The Dockerfile
  builds `ride-splash` + `ride-admin` (each needs `BASE_PATH`, splash=`/`, admin=`/admin/`)
  and copies their `dist/public` into `artifacts/api-server/public`.
- **pnpm v10 build scripts:** do NOT use `pnpm approve-builds` in the Dockerfile (no-op in
  non-interactive Docker). Allowed build scripts (esbuild, @swc/core, msw, unrs-resolver)
  are declared in `pnpm-workspace.yaml` `onlyBuiltDependencies`; a single `pnpm install`
  builds them. This was the cause of repeated Railway "Failed to build an image" errors.
- Production DB is Neon (`NEON_DATABASE_URL`, preferred over `DATABASE_URL` by lib/db).
  Keep Neon URL OUT of Replit dev so dev never mutates live data.
