# Uplink

Tesla software updates, tracked from India.

A single-owner dashboard that tracks Tesla software updates for the vehicles on one Tesla account, using the [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api). Built for a Model Y in India.

- Shows each vehicle's current version, any pending update (available, scheduled, downloading, installing) with progress, and when the car was last seen online (IST).
- Keeps a version history and a small chart of version changes.
- Polls every 6 hours. It **never wakes the car**: asleep or offline vehicles are recorded as such and skipped.

Stack: Bun, Next.js 16 (App Router), shadcn/ui, Geist, Recharts, Supabase Postgres (server-side only), Vercel (region `bom1`).

## How it works

| Path | Purpose |
| --- | --- |
| `/login` → `/api/auth/connect` → `/api/auth/callback` | **Sign in with Tesla** is both the dashboard login and the data connection (authorization code + `state` cookie). The first Tesla account to sign in becomes the owner (its `id_token` `sub` is stored); any other account is refused. Sign-in sets a signed, httpOnly 30-day session cookie, and `proxy.ts` guards everything else. Tokens are stored AES-256-GCM encrypted in Supabase and refreshed automatically (access tokens last ~8 h, refresh tokens rotate). |
| `/api/cron/poll` | Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. Lists vehicles, fetches `vehicle_state` only for online cars, writes a snapshot per vehicle and a `version_history` row when the version changes. |
| `/.well-known/appspecific/com.tesla.3p.public-key.pem` | Serves `TESLA_PUBLIC_KEY_PEM` (rewritten to `/api/public-key`). |
| `/` | Home: the car now (status, battery, version, odometer), one period switch (Week, Month, Year, All) for the distance, spend, energy added and efficiency, each compared with the same span before, then charging, driving and battery. |
| `/updates` | The installed version, any pending update with progress, the version history with download and install times, update stats, and when the car was online or asleep. |
| `/stats/charging`, `/stats/driving`, `/stats/battery` | One topic each, in depth: every session, drive and chart. The period carries over in `?period=`. Old `/stats?view=…` links redirect here (update stats to `/updates`). |
| `/car`, `/settings` | The car's details and battery health; theme, importing past updates and the account. |
| `/rollout` | India rollout tracker, pooled across every car: versions on Indian cars, when the first got each, cars on each now and the lag behind the global release (from a hand-kept list in `lib/rollout.ts`). Totals only, with a state map of where each version runs. |
| `/admin` | For `ADMIN_ACCOUNTS` only (404 for anyone else): owners, cars, version spread, failed checks and health checks. Tesla API usage and cost aren't tracked yet. |

The dashboard also has a **Check now** button that runs the same poll.

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
| `TESLA_PRIVATE_KEY_PEM` | Not used: the app only reads data. Keep the private key offline; only add it if vehicle commands are added later. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix with `NEXT_PUBLIC_`. |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (must decode to 32 bytes). Also signs session cookies. Changing it signs you out and makes stored tokens unreadable: sign in with Tesla again afterwards. |
| `CRON_SECRET` | `openssl rand -hex 32`. Vercel sends it to the cron route automatically. |
| `HEALTH_TOKEN` | Optional. `openssl rand -hex 32`. Bearer token for `GET /api/health/stream`, the streaming health check an external bot polls. Unset, the route answers 503. |
| `TESLA_LOCATION_SCOPE` | Optional. `1` asks Tesla for `vehicle_location` at sign-in, so the 6-hourly check can work out the car's home state (only the state is kept). Enable Vehicle Location in the Tesla developer app first, then sign in again. Unset: the state comes from Supercharger history. |
| `ADMIN_ACCOUNTS` | Optional. Comma-separated Tesla account ids that can open `/admin` (totals across every owner). The id is the `sub` Tesla's sign-in returns, stored after your first sign-in: `select owner_sub from oauth_tokens;` in the Supabase SQL editor. Unset, `/admin` is a 404 for everyone. Demo mode always shows it. |

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

The schema is in [`supabase/migrations/20261021000000_init.sql`](supabase/migrations/20261021000000_init.sql): `oauth_tokens`, `vehicles`, `snapshots`, `version_history`, `poll_runs`. RLS is enabled on every table with no policies, so only the service role (this server) can read or write.

Either paste the file into **Supabase Dashboard → SQL Editor** and run it, or with the CLI:

```sh
supabase link --project-ref fhoqjkriyqwoblfaahpk
supabase db push
```

### 5. Sign in with Tesla (claims the dashboard)

Do this right after the first deploy: until someone signs in, the first Tesla account to do so becomes the owner.

1. Open https://app.getuplink.in and click **Sign in with Tesla**.
2. Sign in to Tesla and approve the requested scopes (vehicle data, charging history, offline access).
3. You land on the dashboard and a first check runs immediately. If the car is asleep, it shows as Asleep with no version until a later check finds it online. Use **Check now** after opening the Tesla app (which wakes the car) to record the version straight away.

### Supercharger history

The **Charging** page (`/stats/charging`) lists your Tesla Supercharger sessions with energy, cost and invoice links. It uses the `vehicle_charging_cmds` scope, so **Vehicle Charging Management** must be enabled in the Tesla developer app, or sign-in fails. Owners who signed in before it was added need to sign in with Tesla again to approve it.

Each check then pulls the last 120 days of sessions for every car. Other networks are not covered yet. The migration is [`supabase/migrations/20261021210000_charging_sessions.sql`](supabase/migrations/20261021210000_charging_sessions.sql).

## Polling and the Vercel Hobby plan

`vercel.json` schedules `/api/cron/poll` every 6 hours (`0 */6 * * *`). **Vercel Hobby only allows crons that run at most once a day, and a more frequent schedule fails the deployment.** On Hobby, either:

- change the schedule to daily, e.g. `0 3 * * *` (8:30 AM IST), or
- remove the `crons` block and use the bundled GitHub Actions fallback: add `CRON_SECRET` as a repository secret and copy [`docs/github-actions-poll.yml`](docs/github-actions-poll.yml) to `.github/workflows/poll.yml` with its `schedule` uncommented. An external scheduler such as cron-job.org calling the same URL with the same header works too.

Fleet API calls are billed per request. Each poll makes one `vehicles` call plus one `vehicle_data` call per online car, so 4 polls a day stays small.

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

Runs `bun dev` with generated data for one car ("Shadow", ten months of updates, three months of driving, charging and battery readings) and signs you in without Tesla or the database. A bar at the top of the home and Updates pages switches the car between parked, charging, downloading an update, installing one, and its first week. Nothing is read from or written to Supabase or Tesla. Demo mode only works under `bun dev`: production builds ignore the flag.

Sign in with Tesla only works against the registered redirect URI, so local dev at `localhost` can't sign in unless you add a localhost redirect URI to the Tesla app and set `TESLA_REDIRECT_URI` to match.

To hand the dashboard to a different Tesla account, clear the owner in Supabase (`update oauth_tokens set owner_sub = null;`) and sign in with the new account.
