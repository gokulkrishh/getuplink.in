# Costs

Notes for agents. `/admin/costs` shows the owner what running Uplink costs this month, in US dollars. It is admin only: the page checks `isAdmin()` before rendering, and every action calls `adminOwner()` again, uncached.

Nothing about the built-in services is typed in. Each one is read from its provider or counted by Uplink. The owner can still add their own rows (in dollars) and set a Google Maps budget.

Code:

- `lib/costs.ts` holds the pure parts: `CostLine`, the period maths, renewals, every price table and estimate (Supabase, Fly.io, Google, Tesla), RDAP parsing, input checks and alerts. Tests: `test/costs.test.ts`, with API fixtures in `test/fixtures/cost-apis.json`.
- `lib/server/costs/` has the providers and the loader (`index.ts`):
  - `vercel.ts`
  - `supabase-billing.ts` (named so the data-layer guard doesn't take it for the database client)
  - `fly.ts`
  - `domain.ts`
  - `usage.ts` for Tesla and Google
  - `http.ts`, the shared GET
- `lib/server/data/costs.ts` holds the `cost_entries` and `cost_settings` reads and writes (service role only).
- `app/admin/costs/` is the page, its actions and its forms. Tests: `test/admin-costs.test.ts`.
- `supabase/migrations/20261101130000_cost_entries.sql` is the migration. The page renders before it is applied. Only adding your own rows and the budget need it.

## Each line

`CostLine` has `name`, `amount` (USD), `period`, `resetsOn`, `source` (`live`, `estimated` or `fixed`), `link` and `state`. `allowance` is a credit the provider takes off before charging (Tesla). `budget` is the owner's own limit (Google). `approx` marks an old row typed in rupees (see Dollars only).

| Service | Badge | How |
| --- | --- | --- |
| Vercel | Live | Billing API: this month's charges. Cached for 1 hour |
| Supabase | Estimated | Management API: the org's plan and the projects' add-ons, at list prices. Cached for 6 hours |
| Fly.io | Estimated | Machines API: the `uplink-telemetry` app's Machines, volumes and IPs, at list prices, always on. Cached for 6 hours |
| Tesla Fleet API | Estimated | Uplink's own request count, against the $10 monthly credit |
| Google Maps Platform | Estimated | Uplink's own count per SKU, at India prices, after the free calls |
| Domain (getuplink.in) | Estimated, yearly | RDAP: the expiry date. Namecheap's .in renewal price. Cached for 6 hours |
| Other | Fixed | Rows the owner adds, in dollars |

## The total

- The header is one tile: this month's total in $.
- A yearly cost counts as a twelfth.
- An allowance comes off first, and a line never goes below zero.
- A line with no figure adds nothing. The tile names each one ("Not counted: Fly.io, Supabase"), and each name links to its row (`#cost-<id>`).

## Dollars only

- Every amount is in USD. Google bills India accounts in INR, but its prices are quoted in USD, so its line is the USD price.
- New rows are in dollars: the form has no currency, and `entrySchema` refuses anything but `USD`.
- Rows saved in rupees before this change show converted at the fixed `LEGACY_USD_INR` (84), marked "≈". Editing one saves it in dollars.
- There is no exchange rate on the page, and no FX call. The `usd_inr` row in `cost_settings`, if there is one, is no longer read.

## Alerts

- A cost that renews on a date (the domain, and any added row with a renewal date) is highlighted and listed when it renews today or within the next 30 days. That includes the 30th day, counted in IST. `renews()` in `lib/costs.ts` decides this: a fixed row, or anything yearly. An added row's past renewal date rolls forward to its next one, monthly or yearly, and the 31st and 29 Feb clamp to the end of the month. The domain uses RDAP's expiry as it is.
- Tesla past its $10 credit, or Google over the owner's budget, gets a one-line warning.

## Caching and failing soft

- Each call has an 8-second timeout.
- **Supabase, Fly.io, the domain:**
  - Each read is a `"use cache: remote"` function with `cacheLife({ stale: 300, revalidate: 21600, expire: 2592000 })`: refreshed in the background every 6 hours, and kept for up to 30 days.
  - A failed read **throws** rather than returning an error. Next's cache doesn't store a result that errored, so the last good read keeps being served. This is the "last known value", and it needs no table. We checked in `node_modules/next/dist/server/use-cache/use-cache-wrapper.js` (`collectResult` errors the stream) and `lib/cache-handlers/default.js` (an errored stream isn't stored), Next 16.4.3.
  - Each read carries `fetchedAt`. A read older than 7 hours (`isStale`) shows "Last read …".
  - If a read fails with nothing cached, the loader catches it and the line reads "Unavailable".
  - A missing token returns `connect`, cached for minutes, so setting the token shows up quickly.
- **Vercel:** cached for an hour. A failure is cached for minutes. Each good read is saved to `cost_settings` (`snapshot:vercel`), and shown with "Last read …" when a later call fails.
- **Logs:** the provider and status only ("Fly.io 401", "RDAP timeout"), from `ProviderError`. A token is never logged, never a cache argument and never returned. Any other error's text is not logged, because it could carry a URL.
- **Follow-up, not done here:** to keep the last value across a cache flush or a redeploy, widen `cost_settings_key_check` and `CostSettingKey` to add `snapshot:supabase`, `snapshot:fly` and `snapshot:domain`, and save each read as Vercel's is. That is a migration and a `lib/server/data` change.

## What each API offers, and the prices

All checked 26 Oct 2026.

### Vercel: live

- `GET https://api.vercel.com/v1/billing/charges?teamId=…&from=…&to=…` returns FOCUS v1.3 charges as JSONL, one row per charge. `from` is inclusive and `to` exclusive, both ISO date-times in UTC, with 1-day granularity and at most a year. The roles allowed are Owner, Member, Developer, Security, Billing and Enterprise Viewer. Each row has `BilledCost` (USD), `ChargeCategory` (Usage, Purchase, Tax, Credit, Adjustment), `ChargePeriodStart` and `ChargePeriodEnd`, and `ServiceName`. [Reference](https://vercel.com/docs/rest-api/billing/list-focus-billing-charges), [MCP tool](https://vercel.com/docs/agent-resources/vercel-mcp/tools/billing/list_billing_charges).
  - Uplink sums `BilledCost` over every row, with credits negative. The window runs from the 1st of the month at 00:00 UTC to the start of tomorrow, so the figure is "so far this month", not a projection.
  - The docs' example shows `BilledCost` as a string and the schema as a number, so both are read. If any row doesn't parse, the whole read is unknown rather than $0.
- `GET /v2/teams/{teamId}` returns `billing.plan`: hobby, pro or enterprise. [Reference](https://vercel.com/docs/rest-api/teams/get-a-team).
- Neither endpoint gives the billing cycle's dates. Uplink uses the calendar month, which resets on the 1st.
- **Token:** there is no read-only token. Use a **Team** token, ideally created by a member with the **Billing** role. Open https://vercel.com/account/settings/tokens, set Scope to the team, choose an expiry, create it, then set `VERCEL_API_TOKEN` and `VERCEL_TEAM_ID` and redeploy. [Access tokens](https://vercel.com/docs/accounts/access-tokens).

### Supabase: estimated

Calls, all `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`, from the [Management API spec](https://api.supabase.com/api/v1-json):

1. `GET https://api.supabase.com/v1/projects` lists every project the token can see, with `ref`, `organization_slug` and `status`. Scope: `projects:read`.
2. Find Uplink's project and take its `organization_slug`. The ref comes from `SUPABASE_URL` (`https://<ref>.supabase.co`), falling back to Uplink's own `fhoqjkriyqwoblfaahpk`.
3. `GET /v1/organizations/{slug}` returns `plan`: free, pro, team, enterprise or platform. Scope: `organizations:read`.
4. On a paid plan, `GET /v1/projects/{ref}/billing/addons` for each project in that org (at most 20) returns `selected_addons`, each with `type`, `variant.id` and `variant.price` (`type` fixed or usage, `interval` monthly or hourly, `amount`).

There is still no endpoint for spend, usage charges or invoices, so this is an estimate at list prices.

Prices, from [supabase.com/pricing](https://supabase.com/pricing). These are `SUPABASE_PRICES` in `lib/costs.ts`.

| Item | Price |
| --- | --- |
| Free plan | $0 |
| Pro plan | $25 a month |
| Team plan | $599 a month |
| Enterprise, Platform | Custom: the line shows no amount |
| Compute credit (Pro, Team) | $10 a month per org, which covers one Micro |
| Compute: Micro, Small, Medium | $10, $15, $60 a month |
| Compute: Large, XL, 2XL | $110, $210, $410 a month |
| Compute: 4XL, 8XL, 12XL, 16XL | $960, $1,870, $2,800, $3,730 a month |
| Custom domain | $10 a month |
| PITR | $100 a month per 7 days of retention: 7, 14 or 28 days is $100, $200 or $400 |
| Log drain | $60 a month, plus usage (not counted) |
| Phone MFA | $75 a month for the first project, then $10 each |
| Anything else (IPv4, ETL) | The add-on's own `price` from the API: monthly as it is, hourly × 730 |

- The estimate is the plan, plus compute past the $10 credit (counted once per org), plus add-ons.
- Projects that aren't running (INACTIVE, REMOVED, PAUSING, GOING_DOWN, INIT_FAILED) add no compute or add-ons.
- A paid project with no compute add-on listed is counted as Micro.
- Usage past the plan's quotas (egress, storage, MAUs) isn't counted, because the API doesn't expose it.
- The billing cycle depends on when the org subscribed, which the API doesn't say, so the line shows no reset date.
- **Token:** `SUPABASE_ACCESS_TOKEN` is a **scoped** personal access token. It is read-only in effect. Don't use a classic ("Legacy") token: it carries the account's full privileges. [Management API auth](https://supabase.com/docs/reference/api/introduction), [Personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens).
  1. Open https://supabase.com/dashboard/account/tokens and generate a new token. Name it, for example "Uplink costs", and set an expiry of up to a year.
  2. Resources: only Uplink's organization.
  3. Permissions, all **Read**:
     - "Projects (account-wide)", for `GET /v1/projects`.
     - "Organization Settings", for `GET /v1/organizations/{slug}`.
     - "Add-ons", for listing project add-ons.
  4. Copy the token (it starts with `sbp_`), set it as `SUPABASE_ACCESS_TOKEN` in the project's env, and redeploy.
  - A token's access can't be edited later: make a new one instead.
  - A 403 lists what is missing in `missing_permissions`, and the Supabase row shows Unavailable, with "Supabase 403" in the log.
  - The rate limit is 120 requests a minute. Uplink makes at most 2 plus one per project every 6 hours.

### Fly.io: estimated

Calls, from the [Machines API spec](https://docs.machines.dev/openapi.json) (base `https://api.machines.dev`):

- `GET /v1/apps/uplink-telemetry/machines`: each Machine's `state` and `config.guest` (`cpu_kind`, `cpus`, `memory_mb`). [Machines resource](https://docs.fly.io/machines/api/machines-resource/).
- `GET /v1/apps/uplink-telemetry/volumes`: each volume's `size_gb` and `state`. [Volumes resource](https://docs.fly.io/machines/api/volumes-resource/).
- `GET /v1/apps/uplink-telemetry/ip_assignments`: `{ ips: [{ ip, shared, egress, region }] }`.
- Header: `Authorization: FlyV1 <token>` when the token already starts with `FlyV1 ` (as `fly tokens create` prints it), otherwise `Bearer <token>`.
- There is still no billing or invoice API, and the Machines API exposes no runtime. Every Machine that isn't destroyed is counted as running all month, stopped ones included.

Prices from [Fly's pricing](https://docs.fly.io/about/pricing), for started Machines in the cheapest regions (iad, ewr). Other regions cost a little more, so treat the figure as a floor. These are `FLY_PRICES` in `lib/costs.ts`.

| Item | Price |
| --- | --- |
| Shared CPU, with 256 MB | $2.19 a month per CPU |
| Performance CPU, with 2 GB | $33.00 a month per CPU |
| RAM past what the CPUs include | $6.00 a GB a month |
| Volumes, attached or not | $0.15 a GB a month |
| Dedicated IPv4 (a v4 address with `shared: false`, not an egress IP) | $2 a month |
| Shared IPv4, IPv6 | Free |

- That model reproduces all six published presets to within a cent: shared-cpu-1x at 256 MB, 512 MB and 1 GB is $2.19, $3.69 and $6.70; shared-cpu-2x at 2 GB is $13.39; performance-1x at 2 GB is $33; performance-2x at 4 GB is $66. A test checks this.
- A GPU or other kind makes the read fail, rather than guessing.
- Outbound data ($0.02 a GB in North America and Europe, more elsewhere) isn't counted.
- **Small invoices:** Fly staff have said on the community forum that a monthly invoice under $5 is voided, as an informal policy that may not last. It isn't in the [billing docs](https://docs.fly.io/about/billing/). See [the forum](https://community.fly.io/t/does-fly-io-still-waive-5-invoices/25651) and [another thread](https://community.fly.io/t/clarification-on-fly-ios-free-tier-and-billing-policy/20909). So the amount isn't zeroed: under $5, the line notes "Fly may waive bills under $5".
- **Token:** `FLY_API_TOKEN`, a read-only org token. [Tokens](https://docs.fly.io/security/tokens). Create it with flyctl (flags checked against `fly tokens create readonly --help`):

  ```sh
  fly tokens create readonly --org personal --name "Uplink costs" --expiry 8760h
  ```

  - Use your org's slug if it isn't `personal` (`fly orgs list`).
  - `--expiry 8760h` is a year. The default is 20 years.
  - Set the whole printed value, including `FlyV1 `, as `FLY_API_TOKEN` and redeploy.
  - Fly describes the token as limited to "reading a single org and its resources". Its docs don't say in so many words that it can call the Machines API's GETs, so check the Fly.io row after connecting. A 401 or 403 shows as Unavailable, and the log says which.

### Domain: estimated, yearly

- `GET https://rdap.org/domain/getuplink.in` (`Accept: application/rdap+json`) redirects to the .in registry's RDAP server (`https://rdap.nixiregistry.in/rdap/`, per the [IANA bootstrap](https://data.iana.org/rdap/dns.json)). It needs no account.
- The response's `events` ([RFC 9083](https://www.rfc-editor.org/rfc/rfc9083)) include `expiration`, which is the renewal date (as an IST day), and `registration`, whose `eventActor` is `namecheap`.
- **Price:** $11.98 a year, Namecheap's regular .in renewal, kept as `DOMAIN.renewalUsd` in `lib/costs.ts`.
  - Fetching Namecheap's own page was blocked (HTTP 403 to automated fetches). The figure is from the search-indexed [Namecheap .in page](https://www.namecheap.com/domains/registration/cctld/in), which lists renewal at $11.98 a year ($59.90 for 5), and [DomainOffer's 2026 listing](https://domainoffer.net/tld/in/namecheap) agrees.
  - An older snapshot of a Namecheap page showed $9.98.
  - **The owner should confirm this** against the renewal price in their Namecheap account, and update the constant if it differs.
- Namecheap's own API isn't used, because it needs the caller's IP allow-listed.

### Tesla Fleet API: estimated

- Tesla gives a $10 monthly discount to support individual developers. Billing cycles are monthly and begin on the 1st. [Billing and limits](https://developer.tesla.com/docs/fleet-api/billing-and-limits).
- Tesla has no usage or cost API. The line comes from Uplink's own count in `api_usage` (`docs/tesla-billing.md`), through `accountKinds(now)`: the same month-to-date figure as /admin's Tesla API total. Before the `api_usage` migration it reads "Not tracked yet".

### Google Maps Platform: estimated

- India billing accounts have their own SKUs. Prices are in USD, charged in INR at Google's rate. Since 1 March 2025, free calls per SKU each month have replaced the old $200 monthly credit. [India pricing](https://developers.google.com/maps/billing-and-pricing/india).

| SKU | Free a month | Then, per 1,000 |
| --- | --- | --- |
| Geocoding | 70,000 | $1.50 |
| Place Details Essentials | 70,000 | $1.50 |
| Place Details Pro | 35,000 | $5.10 |
| Text Search Pro, Nearby Search Pro | 35,000 | $9.60 |
| Place Details Enterprise | 7,000 | $6.00 |
| Text Search Enterprise | 7,000 | $10.50 |
| Autocomplete requests | 70,000 | $0.85 |
| IDs only | Unlimited | $0 |

- These are first-tier prices, up to 5,000,000 a month, which is far past Uplink's use.
- The estimate is the sum over SKUs of `max(0, count - free) / 1000 × price`.
- `googleUsage` reads the month's counts per SKU from `google_usage` (the naming sheet's calls), or null ("Not tracked yet").

## Env

| Name | Needed for | Unset |
| --- | --- | --- |
| `VERCEL_API_TOKEN` | Vercel's live figure. A Team-scoped token, ideally from a Billing-role member | "Not connected", with the steps |
| `VERCEL_TEAM_ID` | The team to read | As above |
| `SUPABASE_ACCESS_TOKEN` | Supabase's plan and add-ons. A scoped personal access token, with Read permissions only | "Not connected", with the steps |
| `FLY_API_TOKEN` | Fly.io's Machines. A read-only org token | "Not connected", with the steps |
| `SUPABASE_URL` | Already set for the database. Gives the project ref | Falls back to Uplink's ref |

RDAP needs nothing. `USD_INR` is no longer read.

## Storage

- `cost_entries` holds the rows the owner adds (`service` null). Its rows for `fly`, `supabase` and `domain`, from when those were typed in, are ignored: not shown, not editable, and left in place. Amounts are `numeric(12,2)`. New rows are USD; old INR rows show converted. A `renews_on` date is optional. `link` must start with `https://`: this is checked in zod and in the database, because it is rendered as an href.
- `cost_settings` holds `google_budget_usd` and `snapshot:vercel` as jsonb with `updated_at`. `usd_inr` may exist from before, but it is unused.
- Both tables have RLS on with no policies, and anon and authenticated have no grants.
