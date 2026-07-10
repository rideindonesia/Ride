---
name: Orval schema naming collision
description: Why request-body component schemas in openapi.yaml must be named *Input, not *Body
---

In this repo's contract-first setup (lib/api-spec/openapi.yaml → Orval codegen), Orval
auto-derives Zod schema names from operationIds (e.g. `register`, `login`, `verify-otp`
→ `RegisterBody`, `LoginBody`...). If you ALSO name a reusable request-body component
`RegisterBody`/`LoginBody`/`RegisterPenggunaBody`, the two collide and codegen emits
duplicate exports → TS2308 "Module has already exported a member".

**Rule:** name reusable request-body component schemas with an `*Input` suffix
(`RegisterInput`, `LoginInput`, `RegisterPenggunaInput`), never `*Body`. The `*Body`
names are reserved for Orval's operation-derived validators that backend routes import.

**Why:** keeps the operation-derived validator names (used by api-server route handlers)
distinct from hand-authored component schema names, so codegen never produces duplicates.

**How to apply:** when adding a new endpoint with a `requestBody` `$ref`, give the
component an `*Input` name and run `pnpm --filter @workspace/api-spec run codegen`.
