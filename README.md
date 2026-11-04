# Uplink

Tesla software updates, charging, driving and battery, tracked from India.

Uplink is a web app for Tesla owners in India, built on the [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api) and [Fleet Telemetry](https://github.com/teslamotors/fleet-telemetry). It runs at [getuplink.in](https://getuplink.in), where it is invite-only. This repository is its full source, under the [MIT licence](LICENSE): read it, learn from it, or run your own copy for your own car.

- Shows each car's installed version, any pending update with progress, and the version history, plus the India rollout pooled across every car.
- Charging (Supercharger invoices and streamed sessions), driving, battery health and efficiency, with week, month, year and all-time views.
- Checks each account about every 6 hours and streams changes while the car is awake. It **never wakes the car**.

Stack: Bun, Next.js 16 (App Router), shadcn/ui, Geist, Recharts, MapLibre, Supabase Postgres (server-side only), Vercel (region `bom1`), and a Fleet Telemetry receiver on Fly.io (`fly/telemetry/`).

Uplink is an independent project. It is not affiliated with, endorsed by or connected to Tesla, Inc. "Tesla" and "Model Y" are trademarks of Tesla, Inc.

## How it works

| Path | Purpose |
| --- | --- |
| `/login` → `/api/auth/connect` → `/api/auth/callback` | **Sign in with Tesla** is both the dashboard login and the data connection (authorization code + `state` cookie). Only a Tesla account with an approved `users` row signs in (matched on its `id_token` `sub`). Uplink is invite-only: the home page has no public sign-in button, only a quiet "Already have access? Sign in". With `SIGNUP_MODE=invite` an unknown account joins only through an invite link and is otherwise told "Uplink is invite-only."; with `SIGNUP_MODE=waitlist` it joins the waitlist instead (its `sub` and the time, no tokens) and lands on `/waitlist`. Declined and suspended accounts are told "Not approved." Sign-in sets a signed, httpOnly 30-day session cookie, and `proxy.ts` guards everything else. Tokens are stored AES-256-GCM encrypted in Supabase and refreshed automatically (access tokens last ~8 h, refresh tokens rotate). |
| `/api/cron/poll` | Called by Vercel Cron every 15 minutes with `Authorization: Bearer $CRON_SECRET`. Takes up to 4 accounts that are due and, for each, lists vehicles, fetches `vehicle_state` only for online cars, writes a snapshot per vehicle and a `version_history` row when the version changes. |
| `/api/cron/stations` | Every 15 minutes, same `CRON_SECRET`. Names the charging station of a streamed session in progress or just ended (see Charging station names). With no such session it makes no Tesla call. |
| `/.well-known/appspecific/com.tesla.3p.public-key.pem` | Serves `TESLA_PUBLIC_KEY_PEM` (rewritten to `/api/public-key`). |
| `/` | Home: the car now (status, battery, version, odometer), one period switch (Week, Month, Year, All) for the distance, spend, energy added and efficiency, each compared with the same span before, then charging, driving and battery. |
| `/updates` | Car > Software: the installed version, any pending update with progress, the version history with download and install times and update stats. Under them the India rollout, pooled across every car: the newest version on Indian cars, what's arriving now, a state map of where each version runs, adoption over time and every version with the lag behind the global release (from a hand-kept list in `lib/rollout.ts`). Totals only. Old `/rollout` links redirect to `/updates#rollout`. |
| `/stats/charging`, `/stats/driving`, `/stats/battery` | One topic each, in depth: every session, drive and chart. The period carries over in `?period=`. Old `/stats?view=…` links redirect here (update stats to `/updates`). |
| `/car`, `/settings` | The car's details (state now, tyres, specs); theme, importing past updates and the account. |
| `/admin` | For the admin only (`users.role = 'admin'`; 404 for anyone else): the Overview tab: owners, cars, version spread, failed checks and health checks. Tabs link Overview, Access and Costs; the account menu has one Admin item. |
| `/admin/waitlist` | Access, for the admin only: places used, invite links (Create, Copy, Revoke, New link, and Suspend for whoever joined), requests waiting, oldest first, with Approve and Decline; approved, suspended and declined accounts with Suspend and Restore. Approve, Restore and joining by invite are refused past `MAX_USERS`. |
| `/invite/<token>` | Public: an invite link. Made for one friend's car (the last 6 characters of its VIN), single use, for a day. "Sign in with Tesla" joins as approved only if a car on that Tesla account has that VIN. Only the token's hash is stored. |
| `/waitlist` | Public: "You're on the waitlist. Sign in again later to check." |

Signing in runs the same check right away, for that account only, at most once every 5 minutes.

Region: the app defaults to `https://fleet-api.prd.na.vn.cloud.tesla.com`. Tesla's [regions page](https://developer.tesla.com/docs/fleet-api/getting-started/regions-countries) assigns this host to "North America, Asia-Pacific (excluding China)" but does not list India by name, so this default is inferred rather than confirmed. If token exchange or vehicle calls fail with a region error, set `TESLA_FLEET_API_BASE_URL` to the host Tesla gives you.

## Setup

### Running your own copy

The steps below set up a deployment of your own. Every example uses Uplink's own hosts (`app.getuplink.in`, `telemetry.getuplink.in`): replace them with your domain, and set `TESLA_PARTNER_DOMAIN` and `TELEMETRY_HOSTNAME` to match. You need your own Tesla developer app, Supabase project and Vercel project. Nothing in this repository connects to Uplink's.

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
| `GOOGLE_MAPS_API_KEY` | Optional. Server-side key with Places API (New) enabled, for the Google places and search in "Name this place" and the live names of places picked from them. Each sheet open makes one Nearby Search Pro call; each search (after a pause, from 2 characters) one Autocomplete call; each row or title showing a Google-picked place one Place Details Pro call. Set it for Preview and Development too, or those have no Google places. All are counted for Admin > Costs. Unset, the sheet offers OpenStreetMap's names and the name field, and a Google-picked place shows its area. See `docs/place-names.md`. |
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
supabase link --project-ref <your-project-ref>
supabase db push
```

### 5. Sign in with Tesla and make yourself the admin

A new database has no accounts, and with the default `SIGNUP_MODE=closed` every Tesla account is refused. To let yourself in:

1. Set `SIGNUP_MODE=waitlist` and redeploy.
2. Open your app, click **Sign in** (under "Already have access?") and approve the requested scopes (vehicle data, charging history, offline access). You land on the waitlist.
3. In the Supabase SQL editor, approve that account and make it the admin:

   ```sql
   update users set status = 'approved', role = 'admin', approved_at = now()
   where id = (select id from users order by id desc limit 1);
   ```

4. Set `SIGNUP_MODE` back to `closed` (or `invite`), redeploy and sign in again. A first check runs right away. If the car is asleep, it shows as Asleep with no version until a later check finds it online. Use **Check now** after opening the Tesla app (which wakes the car) to record the version straight away.

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
bun dev         # http://app.getuplink.localhost:3000 (home at getuplink.localhost:3000)
bun run lint
bun run build
```

### Demo mode (see every page populated)

```sh
bun run demo
```

Runs `bun dev` with generated data for one car ("Demo car", ten months of updates, three months of driving, charging and battery readings) and signs you in without Tesla or the database. A bar at the top of the home and Updates pages switches the car between parked, charging, downloading an update, installing one, and its first week. Nothing is read from or written to Supabase or Tesla. Demo mode only works under `bun dev`: production builds ignore the flag.

### Local HTTPS

```sh
brew install mkcert
scripts/local-https.sh   # once: a trusted certificate for *.getuplink.localhost and localhost
bun run dev:https        # https://app.getuplink.localhost:3000
```

Tesla accepts only the `http://localhost:3000/api/auth/callback` redirect locally, not an https one, so sign in with Tesla under plain `bun dev`. Use `dev:https` for everything after that.

Sign in with Tesla only works against the registered redirect URI, so local dev at `localhost` can't sign in unless you add a localhost redirect URI to the Tesla app and set `TESLA_REDIRECT_URI` to match.

To let another Tesla account in, send them an invite link (Admin > Access), approve their waitlist row there, or use the seeding SQL in [`docs/signup-plan.md`](docs/signup-plan.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the checks every change passes and the house rules for anything an owner reads.

## Security

Please don't open a public issue for a security problem. See [SECURITY.md](SECURITY.md).

## Licence

Uplink's code is under the [MIT licence](LICENSE). Some files in this repository come from others and keep their own terms:

- `lib/station-data.ts`: charging stations © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the [ODbL](https://opendatacommons.org/licenses/odbl/).
- `public/fonts/`: cut-down [Geist](https://github.com/vercel/geist-font) and Geist Mono, under the SIL Open Font License (`public/fonts/OFL-*.txt`).
- `.agents/skills/`: AI coding-agent skills installed from other repositories (sources in `skills-lock.json`). Each keeps the licence of its source repository.
