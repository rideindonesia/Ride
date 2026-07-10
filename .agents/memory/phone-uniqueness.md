---
name: Phone uniqueness enforcement
description: How "1 nomor HP = 1 akun" is enforced across all RIDE registration flows, and why app-level checks alone are insufficient.
---

# "1 nomor HP = 1 akun" enforcement

Enforcing one-phone-one-account across pengguna/mitra/merchant needs BOTH layers:

1. **App-level check** (`isPhoneRegistered` in api-server `src/lib/phone.ts`): checks
   usersTable + non-rejected mitra/merchant applications. Called at every registration
   entry point AND again inside pengguna `verify-otp` right before insert.
2. **DB unique constraint** on `users.phone` (constraint name `users_phone_unique`).

**Why both:** the pengguna register endpoint only reserves an OTP row, not a user. Two
register calls for the same phone create two pending `otp_codes` rows; without a recheck
at verify-otp (and/or a DB constraint) BOTH could verify and create duplicate users. The
register-time check does not cover this because no user exists yet when the second OTP is
issued. The DB constraint is the final race-condition backstop; verify-otp catches Postgres
error code `23505` and returns a friendly 409 instead of a 500.

**How to apply:** any new registration path (new role, admin-create, import) MUST call
`isPhoneRegistered(normalizePhone(phone))` before insert. Store the NORMALIZED phone
(`normalizePhone` → `+62...`) so the unique constraint actually matches across roles.

## drizzle-kit push is interactive — agents can't answer its prompt

`pnpm --filter @workspace/db run push` prompts (TTY) when adding a unique constraint to a
populated table and IGNORES piped stdin (`printf '\n' |` does nothing). For agent/CI use,
apply the constraint directly with psql using the drizzle-expected name so a later push sees
it as already present:
`ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);`
Check for existing duplicates first (`GROUP BY ... HAVING COUNT(*)>1`) before adding.
