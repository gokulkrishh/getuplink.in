# Opening Uplink to other owners: what's left

The owner's decisions are final: sign-ups go through a waitlist the owner approves, the app ships closed, at most 25 users (`MAX_USERS`) on a small Tesla API budget, India and Asia-Pacific only (the existing Tesla APAC registration), and an email is collected at sign-up.

## Done

**Step 1: one data layer** (`lib/server/data/`). No database access exists outside it, and `test/data-layer-guard.test.ts` fails on any import of `lib/server/supabase.ts` or `@supabase/supabase-js`, any `db()` call and any `createClient(` elsewhere.
- `owner.ts`: the `Owner` type and `ownerDb(owner)`, the only way to touch a per-user table (`OWNER_TABLES`), the per-car RPCs and the invoice bucket. `ownerKeys()` is the single place that says which rows are the owner's. Today that is `oauth_tokens` by `provider` + `owner_sub`, `owner_settings`/`connector_token` by `owner = 'tesla'`, and nothing for the car tables, since there is one account.
- `system.ts`: named fleet-wide functions for accounts before an owner is known (sign-in, the session check, the connector token), the check lock (`poll_runs`), rollout, admin, the status page and health checks, telemetry retention, and the shared caches (`release_notes`, `place_names`).
- `owned.ts` / `erase.ts`: Delete my data deletes by the owner's car ids, VINs and invoice ids. It deletes rows that name no owner yet (`poll_runs`, readings for a VIN with no car row) only while `accountCount() <= 1`.
- `lib/server/auth.ts` `currentOwner()` returns the account for a current session. Pages, actions, routes and background syncs pass it down. The MCP route binds its tools to the token's account. The poll and station crons loop over `accountOwners()`. `fleetGet`/`fleetGetRaw` take the owner.

**Step 2: migration, written and not applied**: `supabase/migrations/20261030120000_users.sql`.
- `users` (`tesla_sub` unique, `email` unique case-insensitively, `status` waitlist | approved | declined | suspended, `sessions_valid_after`) and `user_tokens`, which is left empty.
- A `user_id` column on vehicles, snapshots, version_history, charging_sessions, stream_charge_sessions, charge_receipts, owner_settings, connector_token, poll_runs (nullable) and telemetry_readings (nullable, unchecked). Each defaults to `legacy_owner_id()`, so the deployed code works unchanged.
- Composite FKs `(user_id, vehicle_id)` and `(user_id, session_id)`, plus the `check_vin_user` trigger on the two session tables. Together they refuse a row that points at another user's car.
- User-aware overloads `counter_values_at(p_user_id, …)` and `snapshot_odometer_at(p_user_id, …)`.
- A trigger on `oauth_tokens` creates the owner's `users` row on a fresh database.
- Checked in a throwaway PGlite (Postgres 17): the full chain, the old code's writes, cross-user refusals and the fresh-install path. It has not run against Supabase.

Apply step 2 only after step 1 is deployed. Take a backup first.

## Step 3: multi-user code, sign-up still closed

1. **Owner gets a user.** `Owner = { userId: number; sub: string }`. `ownerKeys()` returns `{ user_id: owner.userId }` for every table in `OWNER_TABLES`, and `ownerDb().rpc` calls the `p_user_id` overloads. Nothing else in the app changes: every per-user query already goes through `ownerDb`.
2. **The session carries the user.** The cookie becomes `v4`: `<userId>.<issuedAt>.<expiresAt>.<hmac>`, signed with a new context string in `lib/session.ts`. `currentOwner()` reads the user, requires `status = 'approved'`, and checks `users.sessions_valid_after`. Decide how v3 cookies are handled (see the decisions below).
3. **Token cutover** (one deploy, no old code left running):
   1. Claim the refresh lease on `oauth_tokens`.
   2. Copy its pair, `scope` and `sessions_valid_after` into `user_tokens` and `users` for the legacy owner.
   3. From then on, `tesla.ts` reads and writes only `user_tokens` (`ownerDb(owner).from("user_tokens")`, added to `OWNER_TABLES`).

   Never copy outside the lease: refresh tokens are single use, and a stale copy revokes the chain.
4. **Sign-in** (`claimAccount` → per user): upsert `users` by `tesla_sub`, and store tokens in `user_tokens`. With `SIGNUP_MODE=closed` (the default), an unknown `sub` is refused as today's `not-owner`, so only the owner can sign in.
5. **System functions go per user.**
   - `legacyAccount`: remove it.
   - `accountOwners`: approved users with tokens.
   - `accountCount`: count of users.
   - `connectorTokenAccount`: look up by `token_hash`, with a unique index on it.
   - `healthCheckCar`: the car and its user.
   - `ownedRows`: by `user_id`, and drop the `unclaimed` branch.
   - `erase.ts`: delete `poll_runs` and `telemetry_readings` by `user_id`.
6. **"Delete account"** (new, Settings → Your data): Delete my data, then delete the user's storage files, then `delete from users where id = …`, which cascades. The old restrict key `charge_receipts.session_id` still refuses a cascade through sessions with invoices, so delete the invoices first, as `eraseOwnerRows` does.
7. **Rollout and admin** stay fleet-wide, but dedupe by VIN once two users can share a car, so the same car isn't counted twice (`fleetCars`, `fleetVersionChanges`, `fleetOffers`).
8. **Reads with no VIN** (`lastReadingAt`, `lastCheckAt`) filter by `user_id`. `lastReadingAt` should take the owner's VINs, so the `(vin, field, created_at)` index serves it.
9. **Embeds name their key.** Once the migration is applied, snapshots/vehicles, version_history/vehicles and charge_receipts/stream_charge_sessions each have two foreign keys, and PostgREST refuses an unhinted embed between them (PGRST201). Hint the key (`snapshots!snapshots_vehicle_id_fkey(…)`, as `fleetOffers` does), or read in two steps (as `ownedRows` does). Step 4 drops the old keys, so the hints change then too.
10. **Per-instance throttles become per user:** `charging.ts` `lastAttempt` becomes a `Map` keyed by user id.

## Step 4: remove the single-owner table and keys

Until this step, two users can't track the same car: the old global keys refuse the second copy. Keep sign-up closed until step 4 is done.
1. Drop `oauth_tokens`, `legacy_owner_id()`, the `oauth_tokens_legacy_owner_user` trigger and the `user_id` defaults.
2. Swap the keys:
   - `vehicles`: PK → `(user_id, id)`, and `vin` unique → `(user_id, vin)`. Drop the old `snapshots.vehicle_id` / `version_history.vehicle_id` FKs first.
   - `charging_sessions`: PK → `(user_id, session_id)`.
   - `stream_charge_sessions`: unique → `(user_id, vin, started_at)`.
   - `owner_settings` / `connector_token`: PK → `user_id`, and drop `owner` and the `= 'tesla'` checks.
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

1. The owner's email for their `users` row. The migration leaves it null.
2. An email provider for waitlist and approval notices.
3. At step 3, should existing (v3) sessions be signed out once, or kept as the legacy owner's until they expire?
4. Should waitlisted accounts keep Tesla tokens? The recommendation is no: they sign in again when approved, which keeps the API budget and stored data to approved users only.
5. Should Delete my data also clear `owner_settings` (the charging rates)? Today it keeps them, as before.
6. Should a car tracked by two users count once in rollout totals? The recommendation is yes.
7. When to apply the step 2 migration. It must come after step 1 is deployed, during a quiet hour, with a backup.
