# Costs

Notes for agents. `/admin/costs` shows the owner what running Uplink costs this month. It is admin only: the page checks `isAdmin()` before rendering, and every action calls `adminOwner()` again, uncached.

Code:

- `lib/costs.ts` holds the pure parts: `CostLine`, the currency and yearly-to-monthly maths, renewals, the Google and Tesla figures, input checks and alerts. Tests: `test/costs.test.ts`.
- `lib/server/costs/` has the providers (`vercel.ts`, `usage.ts` for Tesla and Google) and the loader (`index.ts`).
- `lib/server/data/costs.ts` holds the `cost_entries` and `cost_settings` reads and writes (service role only).
- `app/admin/costs/` is the page, its actions and its forms. Tests: `test/admin-costs.test.ts`.
- `supabase/migrations/20261101120000_cost_entries.sql` is the migration. The page renders before it is applied: fixed entries read "Not set" and saving says to apply it.

## Each line

`CostLine` has `name`, `amount`, `currency`, `period`, `resetsOn`, `source` (`live`, `estimated` or `fixed`), `link` and `state`. `allowance` is a credit the provider takes off before charging (Tesla). `budget` is the owner's own limit (Google).

| Service | Source | How |
| --- | --- | --- |
| Vercel | Live | REST API, cached for 1 hour |
| Tesla Fleet API | Estimated | Uplink's own request count, against the $10 monthly credit |
| Google Maps Platform | Estimated | Uplink's own count per SKU, at India prices, after the free calls |
| Fly.io | Fixed | Owner enters it. Fly has no billing API |
| Supabase | Fixed | Owner enters it. The Management API has no cost or usage figures |
| Domain (getuplink.in) | Fixed, yearly | Owner enters it with the renewal date. Namecheap's API needs IP allow-listing, so it isn't called |
| Other | Fixed | Rows the owner adds |

## The total

- The header is the month's total in ₹, with $ beside it.
- A yearly cost counts as a twelfth.
- An allowance comes off first, and a line never goes below zero.
- Lines with no figure add nothing, and the header says how many weren't counted.
- The dollar rate is the one saved on the page, or env `USD_INR`, or 84. The page says which one it used, and when a saved rate was set.

## Alerts

- A fixed cost renewing today or within the next 30 days (the 30th day included, counted in IST) is highlighted and listed. A renewal date that has passed rolls forward to its next one, monthly or yearly. The 31st and 29 Feb clamp to the end of the month.
- Tesla past its $10 credit, or Google over the owner's budget, gets a one-line warning.

## Failing soft

- Each live call has an 8-second timeout. The result is cached in `"use cache: remote"` (shared across instances) for an hour (`cacheLife("hours")`). A failure is cached only for minutes.
- Each successful Vercel read is saved to `cost_settings` (`snapshot:vercel`). When a later call fails, the page shows that value with "Last read …". With no saved value it shows "Unavailable".
- The log gets the HTTP status only. The token is never logged, never a cache argument and never returned.

## What each API offers

Checked 26 Oct 2026.

### Vercel: live

- `GET https://api.vercel.com/v1/billing/charges?teamId=…&from=…&to=…` returns FOCUS v1.3 charges as JSONL, one row per charge. `from` is inclusive and `to` exclusive, both ISO date-times in UTC, with 1-day granularity and at most a year. The roles allowed are Owner, Member, Developer, Security, Billing and Enterprise Viewer. Each row has `BilledCost` (USD), `ChargeCategory` (Usage, Purchase, Tax, Credit, Adjustment), `ChargePeriodStart` and `ChargePeriodEnd`, and `ServiceName`. This is the endpoint the Vercel MCP's `list_billing_charges` uses. [Reference](https://vercel.com/docs/rest-api/billing/list-focus-billing-charges), [MCP tool](https://vercel.com/docs/agent-resources/vercel-mcp/tools/billing/list_billing_charges).
  - Uplink sums `BilledCost` over every row, with credits negative. The window runs from the 1st of the month at 00:00 UTC to the start of tomorrow, so the figure is "so far this month", not a projection.
  - The docs' example shows `BilledCost` as a string and the schema as a number, so both are read. If any row doesn't parse, the whole read is unknown rather than $0.
- `GET /v2/teams/{teamId}` returns `billing.plan`: hobby, pro or enterprise. [Reference](https://vercel.com/docs/rest-api/teams/get-a-team).
- Neither endpoint gives the billing cycle's dates. Uplink uses the calendar month, which resets on the 1st. A Pro cycle that starts mid-month will differ from this.
- **Tokens:** there is no read-only token. A token is Full Account, Team or Project scoped, and acts with its creator's role. [Access tokens](https://vercel.com/docs/accounts/access-tokens).
  - Billing is team-level, so use a **Team** token. A project token can't read it.
  - For the narrowest access, have a team member with the **Billing** role create it, so the token can't deploy or change settings.

### Tesla Fleet API: estimated

- Tesla gives a $10 monthly discount to support individual developers. Billing cycles are monthly and begin on the 1st. [Billing and limits](https://developer.tesla.com/docs/fleet-api/billing-and-limits).
- Tesla has no usage or cost API. The line comes from Uplink's own request count: `teslaUsage` in `lib/server/costs/usage.ts`. It returns `{ estimatedUsd }` for the month, or null, which shows as "Not tracked yet".
- The counter (`api_usage` and its helpers, with `docs/tesla-billing.md`) is being built separately. Wire it in at merge by replacing the stub.

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
- The estimate is the sum over SKUs of `max(0, count - free) / 1000 × price`, in `GOOGLE_SKUS` and `googleEstimate`.
- Count each call under the SKU its field mask bills. Place Details with only Essentials fields is `placeDetailsEssentials`, and so on.
- `googleUsage` in `lib/server/costs/usage.ts` returns the month's counts per SKU, or null ("Not tracked yet"). Wire the place-lookup counter in at merge.
- The billing link is `https://console.cloud.google.com/billing`. No account ids go in code.

### Fly.io: fixed

- Fly has no billing or invoice API. The Machines API spec (`https://docs.machines.dev/openapi.json`, 71 paths) has nothing for billing or usage, and flyctl has no billing command. Invoices are in the dashboard, through Stripe. [Billing docs](https://fly.io/docs/about/billing/), [community request for a billing API](https://community.fly.io/t/read-only-billing-cost-api-for-organizations/28382).
- The owner enters the monthly amount. Link: `https://fly.io/dashboard/personal/billing`.

### Supabase: fixed

- The Management API (`https://api.supabase.com/api/v1-json`) has nothing for cost, invoices or usage charges:
  - `GET /v1/organizations/{slug}` returns only the plan name (free, pro, team, enterprise). Its scope is `organizations:read`.
  - `GET /v1/projects/{ref}/billing/addons` lists add-ons with their list prices, but no spend.
- Usage and the upcoming invoice are only in the dashboard. [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [cost control](https://supabase.com/docs/guides/platform/cost-control).
- A plan name alone isn't a cost, so Uplink uses a fixed monthly entry and adds no management token. Link: `https://supabase.com/dashboard/org/_/billing`.

### Namecheap: fixed, yearly

- Not called, because the API needs the caller's IP allow-listed. The owner enters the yearly price and renewal date.

## Env

| Name | Needed for | Default |
| --- | --- | --- |
| `VERCEL_API_TOKEN` | Vercel's live figure. A Team-scoped token, ideally from a Billing-role member | Unset: the row shows "Not connected" with the steps |
| `VERCEL_TEAM_ID` | The team to read | Unset: as above |
| `USD_INR` | Rupees to a dollar, until a rate is saved on the page | 84 |

## Storage

- `cost_entries` has one row per built-in service (`service` is fly, supabase or domain, and unique), plus the rows the owner adds (`service` null). Amounts are `numeric(12,2)` in INR or USD, monthly or yearly. A `renews_on` date is optional. `link` must start with `https://`: this is checked in zod and in the database, because it is rendered as an href.
- `cost_settings` holds `usd_inr`, `google_budget_usd` and `snapshot:vercel`, as jsonb with `updated_at`.
- Both tables have RLS on with no policies, and anon and authenticated have no grants.
