---
name: Importing an existing multi-artifact repo from GitHub
description: How to bring an already-built pnpm-workspace multi-artifact project (built in a prior Replit session, pushed to GitHub, deployed elsewhere e.g. Railway) into a fresh Replit workspace.
---

Scenario: user has a real production app whose code lives on GitHub (previously built via Replit Agent, now deployed on their own infra). The current Replit workspace is a fresh scaffold unrelated to it. User wants to keep developing it here.

Steps that worked:
1. Connect GitHub via the `connector:ccfg_github_...` integration (ProposeIntegration) so `git fetch`/pull can use Replit-managed auth — repo was public so plain HTTPS fetch worked without a token anyway.
2. `git remote add origin <url>`, `git fetch origin main`, `git reset --hard origin/main` — safe when the local workspace only has a throwaway "Initial commit" with no real work to lose. Histories are unrelated so a normal merge/pull would conflict; hard reset is the right move here, not `gitPull`.
3. After reset, `listArtifacts()` only shows whatever was already registered in the *platform's* artifact DB (in this case just the scaffold's `api-server` + `mockup-sandbox`) — it does NOT auto-discover `.replit-artifact/artifact.toml` files that arrived via git. Extra artifacts baked into the imported repo (e.g. `artifacts/ride-admin`, `artifacts/ride-splash`, each with a complete, valid `artifact.toml`) are invisible to workflows/routing until registered.
4. To register a pre-existing, already-correct `artifact.toml` that isn't in the platform DB yet: copy it to a sibling `artifact.edit.toml` in the same `.replit-artifact/` dir (even with unchanged content) and call `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })`. This both validates and adds the artifact to the registry — confirmed by `listArtifacts()`/an `automatic_updates` message afterward and new workflows appearing. Do this once per missing artifact; one call can trigger both an "Added artifact" and a "Configured workflows changed" update for that one artifact (and in this case a single call happened to register two artifacts' worth of updates in the automatic_updates stream — verify with `listArtifacts()` after each call rather than assuming).
5. `pnpm install` at the root before restarting the newly-registered artifacts' workflows — they'll fail with `vite: not found` otherwise (their node_modules were never installed).
6. `pnpm --filter @workspace/db run push` to sync schema against the pre-provisioned dev Postgres.

**Why:** `createArtifact()` can't be used here — it requires a fresh, unused slug and scaffolds new files, which would clobber the real imported code. `verifyAndReplaceArtifactToml` is the only available callback that accepts an existing, fully-formed `artifact.toml` and syncs it into the platform registry.

**How to apply:** Any time a git import/restore brings in `artifacts/<slug>/.replit-artifact/artifact.toml` files that predate this workspace session, check `listArtifacts()` first — if they're missing, register each via the temp-file + `verifyAndReplaceArtifactToml` trick rather than trying `createArtifact` or hand-editing workflows.
