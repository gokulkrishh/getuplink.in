# Opening Uplink to other owners: what's left

The owner's decisions are final:
- Sign-ups go through a waitlist the owner approves, and the app ships closed.
- At most 25 approved users (`MAX_USERS`), on a small Tesla API budget.
- India and Asia-Pacific only (the existing Tesla APAC registration).
- **No email at all.** A request keeps only its Tesla account id and when it asked. An approved person finds out by signing in again.
- **The admin is a role in the database** (`users.role = 'admin'`), set by hand. Nothing about the owner is in code or env. No passkeys.

| Step | Status |
| --- | --- |
| 1. One data layer | Live |
| 2. `users` migration | Applied |
| 3. Multi-user code, sign-up closed | Built, merged here, not deployed |
| 4. Per-user keys, shared cars, drop the single-owner table | Built here, not deployed: three migrations, not applied. Do before approving anyone but the owner |
| 5. Scale and limits | Built here, not deployed: `MAX_USERS`, per-user checks, API usage counts and the budget guard. Migration written, not applied |
| 6. Waitlist | Built here, not deployed: waitlist sign-up, region check, `/admin/waitlist`, admin role. Copy for more than one owner and the rollout opt-out not started |

## Done

**Step 1: one data layer** (`lib/server/data/`). No database access exists outside it, and `test/data-layer-guard.test.ts` fails on any import of `lib/server/supabase.ts` or `@supabase/supabase-js`, any `db()` call and any `createClient(` elsewhere.
- `owner.ts`: the `Owner` type and `ownerDb(owner)`, the only way to touch a per-user table (`OWNER_TABLES`), the per-car RPCs and the invoice bucket. `ownerKeys()` is the single place that says which rows are the owner's (`user_id`, since step 3).
- `system.ts`: named fleet-wide functions for accounts before an owner is known (sign-in, the session check, the connector token), the check lock (`poll_runs`), rollout, admin, the status page and health checks, telemetry retention, and the shared caches (`release_notes`, `place_names`).
- `owned.ts` / `erase.ts`: Delete my data deletes only the owner's rows (by `user_id` since step 3).
- `lib/server/auth.ts` `currentOwner()` returns the account for a current session. Pages, actions, routes and background syncs pass it down. The MCP route binds its tools to the token's account. The poll and station crons loop over `accountOwners()`. `fleetGet`/`fleetGetRaw` take the owner.

**Step 2: migration, written and not applied**: `supabase/migrations/20261030120000_users.sql`.
- `users` (`tesla_sub` unique, `email` unique case-insensitively, `status` waitlist | approved | declined | suspended, `sessions_valid_after`) and `user_tokens`, which is left empty. The `email` column and its `users_waitlist_email_check` came from an earlier plan; step 6's migration drops the check, and the column stays null and unused until step 4 drops it.
- A `user_id` column on vehicles, snapshots, version_history, charging_sessions, stream_charge_sessions, charge_receipts, connector_token, poll_runs (nullable) and telemetry_readings (nullable, unchecked). Each defaults to `legacy_owner_id()`, so the deployed code works unchanged.
- Composite FKs `(user_id, vehicle_id)` and `(user_id, session_id)`, plus the `check_vin_user` trigger on the two session tables. Together they refuse a row that points at another user's car.
- User-aware overloads `counter_values_at(p_user_id, …)` and `snapshot_odometer_at(p_user_id, …)`.
- A trigger on `oauth_tokens` creates the owner's `users` row on a fresh database.
- Checked in a throwaway PGlite (Postgres 17): the full chain, the old code's writes, cross-user refusals and the fresh-install path.

Applied to production after step 1 was deployed. `owner_settings` never existed in production and was dropped from the plan.

**Step 3: multi-user code, sign-up still closed.** No migration: it runs on the step 2 schema as applied.
- **The owner is a user.** `Owner = { userId, sub }`. `ownerKeys()` is `{ user_id: owner.userId }` for every table in `OWNER_TABLES` (now `user_tokens` instead of `oauth_tokens`), and `ownerDb().rpc` passes `p_user_id`, so PostgREST picks the user-aware overloads. The poll upserts `vehicles` on `(user_id, id)`, the connector token on `user_id`.
- **The session names the user.** The cookie is `v4`: `<userId>.<issuedAt>.<expiresAt>.<hmac>`, signed under `uplink/session/v4`. A v3 cookie doesn't verify, so the deploy signs everyone out once (the owner's decision). `currentOwner()` reads the `users` row, requires `approved`, and checks `users.sessions_valid_after`, which Sign out everywhere and Disconnect now write.
- **Sign-in** (`signIn` in `lib/server/tesla.ts`): a Tesla login whose `sub` is an approved `users.tesla_sub` signs in, and its pair goes to `user_tokens` (upsert, so a sign-in always wins). Anyone else gets no session and none of their Tesla tokens are stored (step 6 adds the waitlist outcomes). The first-sign-in claim is gone. `SIGNUP_MODE` is `signupMode()` in `lib/server/env.ts`, default and fallback `closed`.
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
  - The check lock (`poll_runs`) is still one run for everyone; step 5 makes it per user (built).
  - The Fly receiver still writes readings with the default `legacy_owner_id()` (step 4 reads them per car instead, and drops the column).

**Deploy notes for step 3.** Deploy at a quiet hour, and don't roll back after it: the cutover empties `oauth_tokens`' pair, so the old code would come back "not connected" and need a sign-in. The owner is signed out and signs in again. A fresh database (local dev, a new project) needs its owner seeded by hand, since nobody can claim it by signing in:
```sql
insert into public.users (tesla_sub, status, approved_at) values ('<tesla sub>', 'approved', now());
-- After step 6's migration: the owner is the admin.
update public.users set role = 'admin' where tesla_sub = '<tesla sub>';
```

## Step 4: more than one owner, and shared cars (built here, not deployed)

Until step 4 is rolled out, two users can't track the same car: the old global keys refuse the second copy. **Approve no one but the owner until migration 2 below is applied.** `SIGNUP_MODE=waitlist` is safe before then, since a request stores no car.

### The design: readings once per car, a window per user

The Fly receiver keeps writing each reading once per VIN, exactly as today. `fly/telemetry/worker.ts` is unchanged and needs no deploy. Each user reads a car's readings through their own car row (`vehicles (user_id, vin)`, the per-user car link), which now carries the window that user may see:
- `vehicles.readings_from`: when they began tracking it. It is `-infinity` for the cars that existed before step 4, so the owner keeps all their history, and `now()` for every new link. A second user of a shared car sees what it streams from then on, never the time before.
- `vehicles.readings_until`: set by the check (`syncWindows` in `lib/server/poll.ts`) once the car has been missing from that user's Tesla vehicle list for 7 days (`GONE_AFTER_MS`), closing at the first check that missed it (`vehicles.missing_since`). A seller then stops seeing what the car streams for its next owner.
  - A car missing from one list and back on the next keeps its window untouched. Closing on one bad list would be costly: reopening starts the window from that moment, so the owner's history would be hidden and then deleted as nobody's.
  - A car back after a confirmed close (bought back) gets a new window from its return. The time it was someone else's stays hidden.

The app reads readings only through the view `user_telemetry_readings` (readings joined to car rows, inside each row's window), filtered to the signed-in user by `ownerDb(owner).readings(...)`. `telemetry_readings` is no longer in `OWNER_TABLES`, so no per-user query can write or delete it. `counter_values_at(p_user_id, …)` applies the same window.

Why not a copy per user (the earlier plan):
- Tesla streams a car once per app, however many users track it. A copy per user doubles writes and storage for a shared car, and double counts streamed signals in the budget.
- The receiver would have to look up each VIN's users, and a stale cache would file rows under the wrong user or lose them.
- It needs a new unique index built concurrently on the largest table, by hand.

One copy keeps the receiver, the `(vin, field, created_at)` key and the signal count as they are. Every per-user read still walks that index (checked with `EXPLAIN` in PGlite).

**Readings stay while anyone tracks the car.**
- Delete my data and Delete account delete the leaving user's car rows, then `forget_unseen_readings(vin)` deletes the readings no remaining window covers: all of them once nobody tracks the car.
- `fold_signal_days` runs only for cars nobody tracks any more.
- `stopStreaming` (Delete my data, Delete account, Disconnect) skips any car another user still tracks with an open window, because Tesla's streaming config is one per car.
- The daily retention run first runs `prune_unseen_readings`, which catches a delete that didn't finish and a car still streaming after its last user left.
- `prune_telemetry_readings`' near-charge check stays on `vin` alone: any user's charge session protects a Location row, which is right for a shared reading.

**Per-user keys.**
- `vehicles` PK becomes `(user_id, id)`, and `vin` is unique per user.
- `charging_sessions` PK becomes `(user_id, session_id)`.
- `stream_charge_sessions` is unique on `(user_id, vin, started_at)`.
- `version_history`'s two unique keys become per user, since both users of a shared car record the same streamed change.
- `charge_receipts`' `source_ref` and invoice-number keys become per user, so each user can attach the same invoice to their own session. Its restrict key on `session_id` goes, and `session_id` stays the PK, since it is an identity and unique across users.
- `connector_token` PK becomes `user_id`, and the `owner = 'tesla'` column goes.

The code upserts on `user_id,session_id` and `user_id,vin,started_at`. Rollout totals embed snapshots through `snapshots_user_vehicle_fkey`.

**Removed:** the step 3 token cutover (`adoptLegacyTokens`, the `retireLegacyTokens` calls, `legacyTokens`, `claimLegacyLease`, `releaseLegacyLease`, `retireLegacyTokens`) and the `oauth_tokens` branch of `accountOwners`.

### Migrations, in order, each applied alone

`supabase db push` applies every pending file at once, so apply these one at a time (SQL Editor, or one push per file).

1. `20261102120000_shared_cars.sql` (expand). Adds the window columns, the view, the forget and prune functions, the window in `counter_values_at`, and the per-user unique indexes beside the old ones. It is safe under the deployed code: the owner's answers don't change, and the old conflict targets still exist.
2. `20261102130000_per_user_keys.sql` (contract). Drops the single-owner keys and swaps the primary keys. Apply it only after the step 4 app is deployed: the step 3 code's upserts on `session_id` and `vin,started_at` fail with 42P10 once it runs.
3. `20261102140000_drop_single_owner.sql` (cleanup). Drops:
   - `oauth_tokens`, its trigger, `legacy_owner_user()` and `legacy_owner_id()`;
   - every `user_id` default;
   - `telemetry_readings.user_id`, which is metadata only;
   - the old `counter_values_at` and `snapshot_odometer_at` signatures;
   - `users.email` and `users_email_key`;
   - `owner_settings`, if it exists.

   It refuses to run while `oauth_tokens` still holds a token pair or any `users.email` is set.

Checked in a throwaway PGlite (Postgres 17): every migration in order, with data shaped like production (one owner, the cutover done, a car with 100k readings, sessions and an invoice). It covered the step 3 writes after 1, a second user's copy refused before 2 and accepted after it, the windows, the plans, Delete account by each user, the sweep (5 ms over 1M rows with nothing to delete; 400k rows of a shared car forgotten in under a second, by index range and key lookups), the cleanup and its guard.

### Rollout

0. **Check first.** In production, confirm that `oauth_tokens` has no pair and `user_tokens` has the owner's row (the step 3 cutover ran):
   `select access_token_enc is null and refresh_token_enc is null from oauth_tokens;`
1. **Apply migration 1.** If it fails, it rolls back as one transaction and nothing changes.
2. **Deploy the app** (merge to main; the receiver workflow doesn't fire, since `fly/telemetry` is unchanged).
   - If the deploy fails or misbehaves, roll back to the step 3/5/6 build: it still works on migration 1.
   - Before migration 1, the new app would show no streamed data (the view is missing) and fail Delete my data at the readings step. That is why migration 1 goes first.
3. **Apply migration 2**, once the app is live and a check has run cleanly.
   - If it fails, it rolls back, and the app keeps working on migration 1.
   - Once it is applied, don't roll the app back to step 3: its charging upserts would fail.
4. **Apply migration 3.**
   - If its guard stops it, nothing changes: sign in once as the owner, or check what `users.email` holds, then rerun.
   - Rolling back past it isn't possible. Nothing it drops holds data by then.
5. **Approve other users.**

### Still open

- A car's streaming config is still set by hand per VIN (`scripts/telemetry-config.mjs`). A second user's car streams only once someone sends its config.
- A seller keeps seeing a sold car's stream for up to 7 days, until the close is confirmed. Checks paused by the budget don't advance it.
- The charging-session trigger (`check_vin_user`) can refuse a second user's first Supercharger sync for a shared car if it runs before their car row exists (the check runs both at once). The next check retries it.

## Step 5: scale and limits

Built here, not deployed. Prices, the credit, the reset rule and what's ambiguous: `docs/tesla-billing.md`.

**Migration** `supabase/migrations/20261101120000_api_usage.sql`, not applied. Checked in a throwaway PGlite over every earlier migration.
- `api_usage (user_id, month, kind, count)` and `increment_api_usage()`, an atomic upsert-increment. user_id 0 is unattributed: a sign-up's region check, and deleted accounts' counts (`fold_api_usage()`, so a deletion doesn't take its spend out of the month). No foreign key, for that reason.
- `telemetry_signal_days (vin, day, signals)` and `count_telemetry_signals()`. Delete my data calls `fold_signal_days()`, which moves the cars' days into a VIN-less row, so the VINs go and the month's total stays.
- `users.next_check_at`, `check_lock_until` and `check_now_at`, and `claim_scheduled_check()` / `claim_check_now()`: each claim is one conditional update.
- The check lock becomes one per user: `poll_runs_one_running_per_user_idx` replaces `poll_runs_one_running_idx` (step 4's item 5, done here).

**Apply it before deploying this code.** It is safe under the deployed code (checked in PGlite). The code also runs without it: it counts nothing (it logs once), every check is "normal", and the 15-minute cron checks everyone together only once the newest `poll_runs` row is 6 hours old, as today. But an instance that found the table missing stops counting until it restarts, so applying it after the deploy loses counts for a while.

- **Counting:** every Fleet API request goes through `teslaFetch` in `lib/server/tesla.ts` and is counted under its user and kind (`lib/tesla-billing.ts` `kindOf`). That includes the vehicle list, vehicle_data, charging history, invoices, release notes, the streaming config (GET and DELETE) and errors, and the sign-up region check. Answers below 500 count, once per attempt, as Tesla bills them. A count that fails never fails the call. Uplink has no wake call, and a test checks the source for one.
- **Streaming signals:** counted once a day in the retention cron, before it prunes, from `telemetry_readings` rows per VIN per UTC day. The last 3 days are recounted and set each run. The Fly receiver is unchanged. Why this over a receiver counter: see `docs/tesla-billing.md`.
- **Cron:** `vercel.json` polls every 15 minutes (`checkDue` in `lib/server/poll.ts`).
  - Each run takes up to 4 users who are due (`next_check_at` passed or unset, lock free), soonest first, one after another, and stops starting new ones after 40 s.
  - Each is claimed with a conditional update that moves `next_check_at` on and sets `check_lock_until`. The per-user `poll_runs` row is the check's lock, as before.
  - A user another check holds is put back as due for the next run.
- **Budget:** the developer account's month-to-date estimate (every user's requests, the unattributed ones and the signals) against `TESLA_BUDGET_USD` (default $10, the credit).
  - From 80%: a check makes the user due again in 12 hours, not 6.
  - From 100%: no checks until the 1st. The station check's Tesla call and the Charging page's history sync are skipped. Streaming, health checks, invoices and Disconnect carry on.
  - Unreadable usage never throttles.
- **On-demand check:** the check after a sign-in is now that user's only (`checkNow`), at most once per 5 minutes (`check_now_at`), and skipped past the budget. There is no Check now button; this is the only on-demand check.
- **Health checks:** the poll cron records one only when none landed in the last 20 minutes, so the 15-minute cron doesn't add 2 Fleet API calls a run. The health check reuses Tesla's streaming config and errors for an hour, stored in `tesla_answer_cache` (same migration), so the bot's 15-minute calls ask Tesla at most once an hour. The other checks stay live, and the JSON's `config.fetched_at` says when Tesla was last asked. Delete my data removes the stored answer (it carries the user whose token asked), and Delete account cascades.
- **Settings > Tesla API usage:** this month's estimate against the $10 credit, a meter, requests and signals by category, and "Resets 1 Nov". Everyone, an admin too, sees their own share. The Live data row says when checks are slowed or paused. The account's total, its requests per kind, signals and check state are on `/admin/costs` (the Tesla row's Breakdown); `/admin` shows the total with a link there.
- **`MAX_USERS`** (env, default 25): done. Approved users, admins included, are capped. Approve and Restore are refused past it, in the UI and again on the server.
  - A suspended account doesn't hold a place.
  - The cap is a count then a conditional update (`decide` in `lib/server/waitlist.ts`). With one admin deciding by hand, two approvals racing for the last place isn't worth a lock.
- **Crons skip approved users with no tokens:** done. `accountOwners()` checks a user only once they've signed in after approval, or the old single owner before the cutover. Otherwise each newly approved user would fail every run with "not connected".

## Step 6: the waitlist (built, not deployed)

**Migration** `supabase/migrations/20261031120000_users_role_no_email.sql`, not applied:
- drops `users_waitlist_email_check`;
- adds `role text not null default 'user' check (role in ('user','admin'))`.

It sets nobody's role. Apply it **before** deploying this code: `/admin` reads `role`. Then set the admin by hand:
```sql
update public.users set role = 'admin' where tesla_sub = '<tesla sub>';
```
Until then nobody is an admin (`/admin` is a 404), and everything else works.

**Sign-in** (`signIn` in `lib/server/tesla.ts`), in order:
1. Approved: signs in, and the tokens are stored, as in step 3.
2. Waitlisted: lands on `/waitlist`, "You're on the waitlist. Sign in again later to check."
3. Declined or suspended: "Not approved."
4. Unknown, `SIGNUP_MODE=closed` (the default): "Sign-up is closed."
5. Unknown, `SIGNUP_MODE=waitlist`:
   - asks Tesla's `/api/1/users/region` with the fresh access token;
   - refuses an account whose `fleet_api_base_url` isn't `TESLA_FLEET_API_BASE_URL`;
   - if Tesla doesn't answer, the sign-in fails rather than joining unchecked;
   - then inserts `users (tesla_sub, status = 'waitlist')`, ignoring a duplicate so a repeat keeps its place.
6. `SIGNUP_MODE=open` acts as `waitlist` until step 4. Auto-approval waits for that.

Only case 1 stores Tesla tokens, sets a session or runs a check. A request keeps its Tesla account id and `created_at`, nothing else. The id_token carries no name or email at the scopes Uplink asks for, and none is wanted.

**Region limit.** Tesla serves North America and Asia-Pacific from one Fleet API base, so the check refuses Europe, the Middle East, Africa and China, but not North America. The owner decides from there.

**Admin** is `users.role = 'admin'`: a current session (`currentOwner()`: signed, not revoked, approved) whose user has the role, read fresh each time (`adminOwner()` in `lib/server/admin.ts`). `ADMIN_ACCOUNTS` is gone.

**`/admin/waitlist`:**
- Places used ("12 of 25 places used"), with details behind ⓘ, and counts for Waiting, Approved, Suspended and Declined.
- Waiting, oldest first: Approve and Decline.
- Approved: Suspend.
- Suspended: Restore, which re-approves within the cap.
- Declined: Restore, which puts the request back on the waitlist.

Each account shows as "Request <id>" with its times; no Tesla ids. The decided lists show the latest 10.

Every decision is one server action (`app/admin/waitlist/actions.ts`). It checks the session and the role again, uncached, then the bound decision and id. It refuses an admin's own row and any admin's.

**Still to do in step 6:**
- copy for more than one owner on the home page and in terms (privacy already says what a request keeps);
- a rollout opt-out (see `lib/server/rollout.ts`, "phase 6");
- a way to withdraw a request. A waitlisted or declined person has no session, so only the owner can delete their row today (in SQL).

## Decisions for the owner

Open: none.

Decided:
- v3 sessions are signed out once at step 3.
- Waitlisted accounts keep no Tesla tokens.
- A car tracked by two users counts once in rollout totals.
- The step 2 migration is applied.
- No email anywhere: not at sign-up, not for notices. An approved person finds out by signing in again.
- Admin is `users.role`, set by hand. No passkeys, no admin env var.
- A waitlist request stores only its Tesla account id and the time.
