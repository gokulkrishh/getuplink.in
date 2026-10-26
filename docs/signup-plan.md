# Opening Uplink to other owners: what's left

The owner's decisions are final: sign-ups go through a waitlist the owner approves, the app ships closed, at most 25 users (`MAX_USERS`) on a small Tesla API budget, India and Asia-Pacific only (the existing Tesla APAC registration), and an email is collected at sign-up.

## Done

**Step 1: one data layer** (`lib/server/data/`). No database access exists outside it, and `test/data-layer-guard.test.ts` fails on any import of `lib/server/supabase.ts` or `@supabase/supabase-js`, any `db()` call and any `createClient(` elsewhere.
- `owner.ts`: the `Owner` type and `ownerDb(owner)`, the only way to touch a per-user table (`OWNER_TABLES`), the per-car RPCs and the invoice bucket. `ownerKeys()` is the single place that says which rows are the owner's (`user_id`, since step 3).
- `system.ts`: named fleet-wide functions for accounts before an owner is known (sign-in, the session check, the connector token), the check lock (`poll_runs`), rollout, admin, the status page and health checks, telemetry retention, and the shared caches (`release_notes`, `place_names`).
- `owned.ts` / `erase.ts`: Delete my data deletes only the owner's rows (by `user_id` since step 3).
- `lib/server/auth.ts` `currentOwner()` returns the account for a current session. Pages, actions, routes and background syncs pass it down. The MCP route binds its tools to the token's account. The poll and station crons loop over `accountOwners()`. `fleetGet`/`fleetGetRaw` take the owner.

**Step 2: migration, written and not applied**: `supabase/migrations/20261030120000_users.sql`.
- `users` (`tesla_sub` unique, `email` unique case-insensitively, `status` waitlist | approved | declined | suspended, `sessions_valid_after`) and `user_tokens`, which is left empty.
- A `user_id` column on vehicles, snapshots, version_history, charging_sessions, stream_charge_sessions, charge_receipts, connector_token, poll_runs (nullable) and telemetry_readings (nullable, unchecked). Each defaults to `legacy_owner_id()`, so the deployed code works unchanged.
- Composite FKs `(user_id, vehicle_id)` and `(user_id, session_id)`, plus the `check_vin_user` trigger on the two session tables. Together they refuse a row that points at another user's car.
- User-aware overloads `counter_values_at(p_user_id, …)` and `snapshot_odometer_at(p_user_id, …)`.
- A trigger on `oauth_tokens` creates the owner's `users` row on a fresh database.
- Checked in a throwaway PGlite (Postgres 17): the full chain, the old code's writes, cross-user refusals and the fresh-install path.

Applied to production after step 1 was deployed. `owner_settings` never existed in production and was dropped from the plan.

**Step 3: multi-user code, sign-up still closed.** No migration: it runs on the step 2 schema as applied.
- **The owner is a user.** `Owner = { userId, sub }`. `ownerKeys()` is `{ user_id: owner.userId }` for every table in `OWNER_TABLES` (now `user_tokens` instead of `oauth_tokens`), and `ownerDb().rpc` passes `p_user_id`, so PostgREST picks the user-aware overloads. The poll upserts `vehicles` on `(user_id, id)`, the connector token on `user_id`.
- **The session names the user.** The cookie is `v4`: `<userId>.<issuedAt>.<expiresAt>.<hmac>`, signed under `uplink/session/v4`. A v3 cookie doesn't verify, so the deploy signs everyone out once (the owner's decision). `currentOwner()` reads the `users` row, requires `approved`, and checks `users.sessions_valid_after`, which Sign out everywhere and Disconnect now write.
- **Sign-in** (`signIn` in `lib/server/tesla.ts`): a Tesla login whose `sub` is an approved `users.tesla_sub` signs in, and its pair goes to `user_tokens` (upsert, so a sign-in always wins). Anyone else, waitlisted, declined or suspended included, gets `not-owner`, and nothing of theirs is stored. The first-sign-in claim is gone. `SIGNUP_MODE` exists (`signupMode()` in `lib/server/env.ts`, default and fallback `closed`) and nothing reads it yet.
- **Token cutover**, automatic, in `adoptLegacyTokens` (`lib/server/tesla.ts`). The first time the new code reads a user's tokens and finds no `user_tokens` row, and that user is `oauth_tokens.owner_sub`, it:
  1. reads the pair and claims `oauth_tokens.refreshing_until` with a compare-and-swap on that refresh token. The lease must be free: released, or run out more than 15 minutes ago, longer than any request of the old code can live.
  2. inserts it into `user_tokens` with ON CONFLICT DO NOTHING. It copies `scope`, `created_at` and `updated_at` too.
  3. empties `oauth_tokens`' pair (compare-and-swap on the same token, `owner_sub` kept for `legacy_owner_id()`).

  An instance that loses the lease waits for the row, as a refresh waits. A disconnected user keeps a `user_tokens` row with no tokens, so nothing is ever copied to them again. A sign-in also empties `oauth_tokens`' pair. Tested in `test/tesla-refresh.test.ts`: five concurrent requests make one copy, an old refresh in flight is waited out, and another user is never handed the pair.
- **System functions.** `legacyAccount` and `claimAccount` are gone.
  - `accountOwners`: approved users, minus a disconnected one. A user with no token row is included, which is how the cron triggers the cutover.
  - `accountCount`: all users. Admin's owners count is approved users.
  - `connectorTokenAccount(hash)`: approved users only.
  - `healthCheckCar`: the car's own user.
  - `ownedRows` / `erase.ts`: everything by `user_id`. Telemetry is deleted by VIN first (indexed), then the user's rest.
- **Delete account** (Settings → Your data, type "delete account"): Delete my data, then `delete from users`, which cascades.
- **Fleet totals count a car once:** `oneCopyPerCar` in `fleetCars`, `fleetVersionChanges`, `fleetOffers`, `fleetSuperchargerSites` and admin's car list. Each car keeps the copy of the lowest user id.
- `lastReadingAt` reads by the owner's VINs. `charging.ts` `lastAttempt` and the in-instance refresh dedupe in `tesla.ts` are per user.
- **Unchanged, on purpose:**
  - Retention prunes by field age across all readings. A loop over users would delete the same rows.
  - The check lock (`poll_runs`) is still one run for everyone; step 5 makes it per user.
  - The Fly receiver still writes readings with the default `legacy_owner_id()`.

**Deploy notes for step 3.** Deploy at a quiet hour, and don't roll back after it: the cutover empties `oauth_tokens`' pair, so the old code would come back "not connected" and need a sign-in. The owner is signed out and signs in again. A fresh database (local dev, a new project) needs its owner seeded by hand, since nobody can claim it by signing in:
```sql
insert into public.users (tesla_sub, status, approved_at) values ('<tesla sub>', 'approved', now());
-- Until step 4: the default user of streamed readings.
insert into public.oauth_tokens (provider, owner_sub) values ('tesla', '<tesla sub>');
```

## Step 4: remove the single-owner table and keys

Until this step, two users can't track the same car: the old global keys refuse the second copy. Keep sign-up closed until step 4 is done.
1. Drop `oauth_tokens`, `legacy_owner_id()`, the `oauth_tokens_legacy_owner_user` trigger and the `user_id` defaults. Do this only once the step 3 cutover has run in production: `oauth_tokens` has no pair left and `user_tokens` has the owner's row. Remove the cutover code with it:
   - in `lib/server/tesla.ts`: `adoptLegacyTokens`, and the `retireLegacyTokens` calls in `signIn` and `disconnectTesla`.
   - in `lib/server/data/system.ts`: `legacyTokens`, `claimLegacyLease`, `releaseLegacyLease` and `retireLegacyTokens`.
   - in this doc: the `oauth_tokens` line of the seeding SQL.
2. Swap the keys:
   - `vehicles`: PK → `(user_id, id)`, and `vin` unique → `(user_id, vin)`. Drop the old `snapshots.vehicle_id` / `version_history.vehicle_id` FKs first.
   - `charging_sessions`: PK → `(user_id, session_id)`.
   - `stream_charge_sessions`: unique → `(user_id, vin, started_at)`.
   - `connector_token`: PK → `user_id`, and drop `owner` and the `= 'tesla'` checks.
   - Drop the restrict key `charge_receipts.session_id`.

   Update every `onConflict` in the code to match.
3. **`telemetry_readings`** (large, write-heavy; use a separate hand-run file):
   1. `create unique index concurrently … (user_id, vin, field, created_at)`.
   2. Change the Fly receiver (`fly/telemetry/worker.ts`) to look up each VIN's users (cached), insert one row per user with `user_id`, and use `on_conflict=user_id,vin,field,created_at`.
   3. Drop the old unique index.
   4. Make `user_id` NOT NULL with `CHECK (user_id is not null) NOT VALID` → `VALIDATE` → `SET NOT NULL`.
   5. Add the users FK and an index for the cascade, or delete readings in batches in Delete account instead.

   `fly/telemetry/worker.ts` is the one writer outside the app: it posts straight to PostgREST with the service-role key.
4. Drop the old RPC signatures. `prune_telemetry_readings`: the near-charge check joins on `user_id` as well as `vin`.
5. `poll_runs_one_running_idx` → unique on `(user_id) where finished_at is null` (with step 5).

## Step 5: scale and limits

- **Cron:** `vercel.json` poll every 15 minutes. Each run takes the users due (`users.next_check_at <= now()`, about every 6 hours each), a few at a time (start with 4, within `maxDuration = 60`). It sets `next_check_at` and takes a per-user lock: `check_lock_until` claimed with a conditional update, or the per-user `poll_runs` index. The `accountOwners()` loop in `pollAll`/`checkStations` is where this goes.
- **Budget:** count Fleet API calls per user per day (a small `api_usage` table written next to `fleetFetch`). Skip optional calls (Supercharger history, release notes, the station check) past a per-user cap. Admin shows the totals (`api.kind` is `checks` today).
- **`MAX_USERS`** (env, default 25) caps approved users. Approval refuses beyond it.

## Step 6: waitlist, then open

- **`SIGNUP_MODE`** (env): `closed` | `waitlist` | `open`.
  - `waitlist`: after Tesla sign-in, an unknown account gives an email (form page) and is saved as `status = 'waitlist'`. Its Tesla tokens aren't stored and it isn't polled (see the decisions below).
  - `open`: auto-approve while approved users < `MAX_USERS`, else waitlist.
- **Region:** at sign-in, ask Tesla for the account's region (`/api/1/users/region`) and refuse anything that isn't served by the APAC Fleet API base (`TESLA_FLEET_API_BASE_URL`).
- **Admin:** a waitlist in `/admin` (`users_status_created_idx`). Approve or decline sets `status` and `approved_at`, and sends a notice email.
- **Copy:** home page, privacy and terms for more than one owner; a rollout opt-out (see `lib/server/rollout.ts`, "phase 6").

## Decisions for the owner

Open:
1. The owner's email for their `users` row. The migration leaves it null.
2. An email provider for waitlist and approval notices.

Decided:
- v3 sessions are signed out once at step 3.
- Waitlisted accounts keep no Tesla tokens.
- A car tracked by two users counts once in rollout totals.
- The step 2 migration is applied.
