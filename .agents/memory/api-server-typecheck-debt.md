---
name: api-server pre-existing typecheck errors
description: The api-server leaf has ~25 pre-existing tsc errors unrelated to feature work; dev runs fine via esbuild/tsx.
---
`pnpm --filter @workspace/api-server run typecheck` reports ~25 errors that are NOT caused by feature work:
- `Conversion of type 'Session & Partial<SessionData>' to 'Record<string, unknown>'` in auth.ts, admin.ts, pengguna.ts — from the `(req.session as Record<string, unknown>).xId = ...` pattern used throughout.
- `Argument of type 'string | string[]' is not assignable to parameter of type 'string'` in admin.ts — Express 5 `req.query` params passed to functions expecting `string`.

**Why:** These predate the Gojek-verticals work (files like auth.ts/admin.ts were never modified). Dev workflows run via esbuild/tsx which do NOT typecheck, so the app runs despite them. `pnpm run build` (typecheck+build) WOULD surface them.

**How to apply:** When judging whether your api-server changes are clean, check that NONE of the new errors fall inside lines you edited. Do not chase these 25 as if they were regressions. Only fix them if the task is explicitly "make build pass".
