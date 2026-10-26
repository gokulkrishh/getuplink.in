# Uplink

Tesla software updates, tracked from India.

A single-owner dashboard that tracks Tesla software updates for the vehicles on one Tesla account, using the [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api). Built for a Model Y in India.

- Shows each vehicle's current version, any pending update (available, scheduled, downloading, installing) with progress, and when the car was last seen online (IST).
- Keeps a version history and a small chart of version changes.
- Polls each account about every 6 hours (every 12, then not at all, as the month's Tesla API estimate nears its budget). It **never wakes the car**: asleep or offline vehicles are recorded as such and skipped.

Stack: Bun, Next.js 16 (App Router), shadcn/ui, Geist, Recharts, Supabase Postgres (server-side only), Vercel (region `bom1`).

## How it works

| Path | Purpose |
| --- | --- |
| `/login` → `/api/auth/connect` → `/api/auth/callback` | **Sign in with Tesla** is both the dashboard login and the data connection (authorization code + `state` cookie). Only a Tesla account with an approved `users` row signs in (matched on its `id_token` `sub`). Uplink is invite-only: the home page has no public sign-in button, only a quiet "Already have access? Sign in". With `SIGNUP_MODE=invite` an unknown account joins only through an invite link and is otherwise told "Uplink is invite-only."; with `SIGNUP_MODE=waitlist` it joins the waitlist instead (its `sub` and the time, no tokens) and lands on `/waitlist`. Declined and suspended accounts are told "Not approved." Sign-in sets a signed, httpOnly 30-day session cookie, and `proxy.ts` guards everything else. Tokens are stored AES-256-GCM encrypted in Supabase and refreshed automatically (access tokens last ~8 h, refresh tokens rotate). |
| `/api/cron/poll` | Called by Vercel Cron every 15 minutes with `Authorization: Bearer $CRON_SECRET`. Takes up to 4 accounts that are due and, for each, lists vehicles, fetches `vehicle_state` only for online cars, writes a snapshot per vehicle and a `version_history` row when the version changes. |
| `/api/cron/stations` | Every 15 minutes, same `CRON_SECRET`. Names the charging station of a streamed session in progress or just ended (see Charging station names). With no such session it makes no Tesla call. |
| `/.well-known/appspecific/com.tesla.3p.public-key.pem` | Serves `TESLA_PUBLIC_KEY_PEM` (rewritten to `/api/public-key`). |
| `/` | Home: the car now (status, battery, version, odometer), one period switch (Week, Month, Year, All) for the distance, spend, energy added and efficiency, each compared with the same span before, then charging, driving and battery. |
| `/updates` | The installed version, any pending update with progress, the version history with download and install times, update stats, and when the car was online or asleep. |
| `/stats/charging`, `/stats/driving`, `/stats/battery` | One topic each, in depth: every session, drive and chart. The period carries over in `?period=`. Old `/stats?view=…` links redirect here (update stats to `/updates`). |
| `/car`, `/settings` | The car's details and battery health; theme, importing past updates and the account. |
| `/rollout` | India rollout tracker, pooled across every car: versions on Indian cars, when the first got each, cars on each now and the lag behind the global release (from a hand-kept list in `lib/rollout.ts`). Totals only, with a state map of where each version runs. |
| `/admin` | For the admin only (`users.role = 'admin'`; 404 for anyone else): owners, cars, version spread, failed checks, health checks, and this month's Tesla API estimate, linking to `/admin/costs` for its breakdown. |
| `/admin/waitlist` | Access, for the admin only: places used, invite links (Create, Copy, Revoke, New link, and Suspend for whoever joined), requests waiting, oldest first, with Approve and Decline; approved, suspended and declined accounts with Suspend and Restore. Approve, Restore and joining by invite are refused past `MAX_USERS`. |
| `/invite/<token>` | Public: an invite link. Made for one friend's car (the last 6 characters of its VIN), single use, for a day. "Sign in with Tesla" joins as approved only if a car on that Tesla account has that VIN. Only the token's hash is stored. |
| `/waitlist` | Public: "You're on the waitlist. Sign in again later to check." |

Signing in runs the same check right away, for that account only, at most once every 5 minutes.

Region: the app defaults to `https://fleet-api.prd.na.vn.cloud.tesla.com`. Tesla's [regions page](https://developer.tesla.com/docs/fleet-api/getting-started/regions-countries) assigns this host to "North America, Asia-Pacific (excluding China)" but does not list India by name, so this default is inferred rather than confirmed. If token exchange or vehicle calls fail with a region error, set `TESLA_FLEET_API_BASE_URL` to the host Tesla gives you.

## Setup

### 1. Environment variables

Every variable is listed in [`.env.example`](.env.example). In Vercel: **Project → Settings → Environment Variables**, add each one for Production (and Preview if you use it), then redeploy. Or with the CLI: `vercel env add NAME production`.

| Variable | Notes |
| --- | --- |
| `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET` | From the Tesla developer app. |
| `TESLA_REDIRECT_URI` | `https://app.getuplink.in/api/auth/callback` (must match the Tesla app). |
| `TESLA_FLEET_API_BASE_URL` | Optional. Defaults to the NA/APAC host above. |
| `TESLA_PUBLIC_KEY_PEM` | From step 2. |
| `TESLA_PRIVATE_KEY_PEM` | Optional, a secret: `keys/private-key.pem` from step 2. Signs each car's streaming config, which Uplink sends once the owner adds its key (`/setup`). It must match `TESLA_PUBLIC_KEY_PEM`, or nothing is sent. Never logged. Unset, `/setup` says Uplink will turn streaming on, and the config goes by hand (`scripts/telemetry-config.mjs`). Uplink sends no vehicle commands. |
| `TELEMETRY_CA_PEM` | Optional: the receiver's CA certificate (`ca.crt`, see `fly/telemetry/README.md`), sent in each car's streaming config. Needed with `TESLA_PRIVATE_KEY_PEM`. |
| `TELEMETRY_HOSTNAME` | Optional. The receiver's host in the streaming config. Default `telemetry.getuplink.in`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix with `NEXT_PUBLIC_`. |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to 32 bytes). Also signs session cookies. Changing it signs you out and makes stored tokens unreadable: sign in with Tesla again afterwards. |
| `CRON_SECRET` | `openssl rand -hex 32`. Vercel sends it to the cron route automatically. |
| `HEALTH_TOKEN` | Optional. `openssl rand -hex 32`. Bearer token for `GET /api/health/stream`, the streaming health check an external bot polls. Unset, the route answers 503. |
| `TESLA_LOCATION_SCOPE` | Optional. `1` asks Tesla for `vehicle_location` at sign-in, so the 6-hourly check can work out the car's home state (only the state is kept). Enable Vehicle Location in the Tesla developer app first, then sign in again. Unset: the state comes from Supercharger history. |
| `SIGNUP_MODE` | Optional. `closed` (default): only approved accounts sign in, and invite links don't work. `invite`: an unknown Tesla account joins only through an invite link; without one it's refused. `waitlist`: invite links work, and an unknown Tesla account in Tesla's NA/APAC region joins the waitlist. `open` acts as `waitlist` for now. |
| `MAX_USERS` | Optional. How many accounts can be approved at once, the admin included. Default 25. |
| `GOOGLE_MAPS_API_KEY` | Optional. Server-side key with Places API (New) and Geocoding API enabled, for the Google places in "Name this place" and the live names of places picked from them. Each sheet open makes one Nearby Search Pro and one Geocoding call; each row or title showing a Google-picked place makes one Place Details Pro call. All are counted for Admin > Costs. Unset, the sheet offers OpenStreetMap's names and the name field, and a Google-picked place shows its area. See `docs/place-names.md`. |
| `OSM_CONTACT` | Optional. An email or URL for OpenStreetMap's operators, sent in the Nominatim User-Agent. |
| `OSM_LOOKUPS` | Optional. `off` stops every Nominatim lookup (names already kept still show). |
| `TESLA_BUDGET_USD` | Optional. What the Tesla developer account may spend in a month, by Uplink's estimate. Checks slow to every 12 hours from 80% of it and pause at 100% until the 1st; streaming carries on. Default 10, Tesla's monthly credit. |

The admin isn't an env var: it's `users.role`. Set it once in the Supabase SQL editor: `update users set role = 'admin' where tesla_sub = '<tesla sub>';`. Demo mode always shows `/admin`.

For local scripts, put the same values in `.env.local` (gitignored), e.g. `vercel env pull .env.local`.

### 2. Generate the Tesla key pair

```sh
bun scripts/generate-keys.mjs
```

This writes `keys/public-key.pem` and `keys/private-key.pem` (prime256v1; both gitignored) and prints next steps. Add the public key to Vercel:

```sh
vercel env add TESLA_PUBLIC_KEY_PEM production < keys/public-key.pem
```

Store the private key in a password manager. Never commit it. Redeploy, then confirm the key is live:

```sh
curl https://app.getuplink.in/.well-known/appspecific/com.tesla.3p.public-key.pem
```

### 3. Register as a Tesla partner (one time)

Needs `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET` in `.env.local`, and the public key live from step 2.

```sh
bun --env-file=.env.local scripts/register-partner.mjs
```

It gets a partner token (`client_credentials`), calls `POST /api/1/partner_accounts` with `{"domain": "app.getuplink.in"}`, then reads back `GET /api/1/partner_accounts/public_key` to confirm. Re-run it if you rotate the key.

### 4. Apply the Supabase migration

The schema is the files in [`supabase/migrations/`](supabase/migrations/), applied in order: `users` and `user_tokens`, then per-user `vehicles`, `snapshots`, `version_history`, `poll_runs` and the rest, and `telemetry_readings`, stored once per car and read by each user through their own car row. RLS is enabled on every table with no policies, so only the service role (this server) can read or write.

Either paste the file into **Supabase Dashboard → SQL Editor** and run it, or with the CLI:

```sh
supabase link --project-ref fhoqjkriyqwoblfaahpk
supabase db push
```

### 5. Sign in with Tesla (claims the dashboard)

Do this right after the first deploy: until someone signs in, the first Tesla account to do so becomes the owner.

1. Open https://app.getuplink.in and click **Sign in** (under "Already have access?").
2. Sign in to Tesla and approve the requested scopes (vehicle data, charging history, offline access).
3. You land on the dashboard and a first check runs immediately. If the car is asleep, it shows as Asleep with no version until a later check finds it online. Use **Check now** after opening the Tesla app (which wakes the car) to record the version straight away.

### Supercharger history

The **Charging** page (`/stats/charging`) lists your Tesla Supercharger sessions with energy, cost and invoice links. It uses the `vehicle_charging_cmds` scope, so **Vehicle Charging Management** must be enabled in the Tesla developer app, or sign-in fails. Owners who signed in before it was added need to sign in with Tesla again to approve it.

Each check then pulls the last 120 days of sessions for every car. Other networks are not covered yet. The migration is [`supabase/migrations/20261021210000_charging_sessions.sql`](supabase/migrations/20261021210000_charging_sessions.sql).

### Charging station names

Sessions rebuilt from Fleet Telemetry are named after the station they happened at, such as "Statiq, Koramangala", instead of "Third-party charger" or "AC charging". `/api/cron/stations` runs every 15 minutes; when a session is in progress or ended in the last 30 minutes without a name, and the token has `vehicle_location`, it reads the online car's location once (`charge_state;drive_state;location_data`), matches it to the nearest station within 150 m in memory, stores only the name and discards the coordinates. Each session is tried once (`station_checked_at`). No station nearby (home charging, say) leaves the session as it was. The migration is [`supabase/migrations/20261025160000_stream_charge_session_station.sql`](supabase/migrations/20261025160000_stream_charge_session_station.sql).

The stations come from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/). `lib/station-data.ts` is generated by `bun scripts/osm-stations.ts` (Overpass API); rerun it now and then to pick up new stations. Pages that show a station name credit OpenStreetMap.

## Polling and the Vercel Hobby plan

`vercel.json` schedules `/api/cron/poll` and `/api/cron/stations` every 15 minutes (`*/15 * * * *`). Each poll run checks the users who are due, up to 4, each about every 6 hours. **Vercel Hobby only allows crons that run at most once a day, and a more frequent schedule fails the deployment.** On Hobby, drop the stations cron (sessions just stay unnamed) and either:

- change the schedule to daily, e.g. `0 3 * * *` (8:30 AM IST), or
- remove the `crons` block and call `/api/cron/poll` from an external scheduler such as cron-job.org, sending `Authorization: Bearer <CRON_SECRET>`.

Fleet API calls are billed per request, and Tesla takes $10 off each month. Uplink counts every request and streamed signal (Settings > Tesla API usage), and slows, then pauses, checks as the month's estimate nears `TESLA_BUDGET_USD`. Prices and the rules: [`docs/tesla-billing.md`](docs/tesla-billing.md).

## Later: Fleet Telemetry

`snapshots.source` and `version_history.source` default to `poll`. A Fleet Telemetry receiver can write rows with `source = 'telemetry'` into the same tables without schema changes.

## Development

```sh
bun install
bun dev         # http://localhost:3000
bun run lint
bun run build
```

### Demo mode (see every page populated)

```sh
bun run demo
```

Runs `bun dev` with generated data for one car ("Demo car", ten months of updates, three months of driving, charging and battery readings) and signs you in without Tesla or the database. A bar at the top of the home and Updates pages switches the car between parked, charging, downloading an update, installing one, and its first week. Nothing is read from or written to Supabase or Tesla. Demo mode only works under `bun dev`: production builds ignore the flag.

Sign in with Tesla only works against the registered redirect URI, so local dev at `localhost` can't sign in unless you add a localhost redirect URI to the Tesla app and set `TESLA_REDIRECT_URI` to match.

To let another Tesla account in, send them an invite link (Admin > Access), approve their waitlist row there, or use the seeding SQL in [`docs/signup-plan.md`](docs/signup-plan.md).
