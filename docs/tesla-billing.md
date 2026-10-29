# Tesla Fleet API billing

What Tesla's own docs say about the Fleet API's prices, credit, billing month and rate limits, and how Uplink counts against them. Checked on **26 Oct 2026**.

Sources:
- Prices and the credit: <https://developer.tesla.com/> (the Fleet API pricing on the home page).
- Billing cycle, the discount, billable requests and rate limits: <https://developer.tesla.com/docs/fleet-api/billing-and-limits>.
- Endpoint lists, checked for per-endpoint categories: <https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-endpoints>, `.../charging-endpoints`, `.../user-endpoints`.

Tesla's billing page in the developer dashboard is the source of truth. Uplink's figures are its own count.

## Prices

| Category | Tesla's price | Per unit |
| --- | --- | --- |
| Streaming signals | 150,000 signals for $1 | $0.00000667 |
| Commands | 1,000 requests for $1 | $0.001 |
| Data | 500 requests for $1 | $0.002 |
| Wakes | 50 requests for $1 | $0.02 |

These are in `lib/tesla-billing.ts` (`PRICE_USD`).

## The monthly credit

- Home page: "Each account receives a $10 monthly discount that will cover the cost to create useful automations for a few vehicles."
- Billing page: "A monthly discount of $10 is provided to support individual developers/small applications."

So the owner is right: **$10 a month, per developer account**, not per user or per car. No eligibility conditions or end date are given.

## The billing month

- "Billing cycles are monthly and begin on the first day of the month."
- "The payment method on file will be automatically charged 14 days after the end of the month."

**Ambiguous: the time zone.** Tesla doesn't say whether the month starts at midnight UTC, Pacific time or something else. Uplink buckets by the **UTC calendar month**. For an owner in India the reset reads as "1 Nov" either way: midnight UTC is 5:30 AM IST and midnight Pacific is 12:30 or 1:30 PM IST, all on the 1st. Usage in the first or last few hours of a month may land in a different month in Uplink's count than in Tesla's.

## What is billed

- "All requests with a status codes below 500 are counted as billable usage." So a 401, 404 or 408 is billed; a 5xx or a request that never got an answer is not. Uplink counts the same way, per HTTP attempt: the 401 that triggers a token refresh and the retry after it are two requests.
- "By default, each account has a billing limit of 0." **Ambiguous:** Tesla doesn't say here whether that means access stops at $10 (the credit) until the owner raises the limit, or just that nothing is charged past it. Check the dashboard's billing limit before relying on either.

**Ambiguous: each endpoint's category.** The billing page says "Each endpoint's pricing category is available in the API documentation", with a screenshot captioned "Pricing category shown on each endpoint." The endpoint pages as served (checked on 26 Oct 2026) show no category for any endpoint, and no other Tesla page lists them. So Uplink assumes the dearest likely category: **every request except a wake is priced as Data** ($0.002). That includes the vehicle list, charging history, invoices, release notes, the streaming config and errors, and the region check. If Tesla prices some of these as Commands or doesn't bill them, Uplink's estimate is too high, never too low. Only the map in `lib/tesla-billing.ts` (`CATEGORY_OF`) changes; the stored counts are per endpoint, so no data moves.

## Rate limits

"The limits are tracked per device, per account." "If an account has multiple developer applications interacting with the same vehicle, these limits are shared."

| Kind | Limit |
| --- | --- |
| Realtime data | 60 requests a minute |
| Device commands | 30 requests a minute |
| Wakes | 3 requests a minute |

Uplink makes a few requests per car per check, far below these.

## Tesla's examples

From the billing page, as a sanity check of the prices:
- A 30-minute app session: 384 data requests, 4 commands and 4 wakes cost $0.852; after moving to streaming (0 data, 4 commands, 1 wake, 300 signals), $0.026.
- A fleet car streaming about 1,000 signals an hour costs "$0.00667 per hour per car via Fleet Telemetry", against "$0.12 per hour" for the same data from vehicle_data.

## What Uplink calls, and what it costs

Uplink never wakes a car: there is no `wake_up` call anywhere in the app (`test/tesla-billing.test.ts` checks the source). A check asks for `vehicle_data` only when the vehicle list says the car is already online.

| Uplink's kind | Endpoint | When | Priced as |
| --- | --- | --- | --- |
| `vehicle_list` | `GET /api/1/vehicles` | each check; the station check when a charge needs a name | Data |
| `vehicle_data` | `GET /api/1/vehicles/{vin}/vehicle_data` | each check, per online car; the station check | Data |
| `charging_history` | `GET /api/1/dx/charging/history` | each check; the Charging page, at most every 30 min | Data |
| `charging_invoice` | `GET /api/1/dx/charging/invoice/{id}` | opening an invoice | Data |
| `release_notes` | `GET /api/1/vehicles/{vin}/release_notes` | a version not seen before | Data |
| `telemetry_config` | `GET` or `DELETE /api/1/vehicles/{vin}/fleet_telemetry_config` | each health check; Disconnect and Delete | Data |
| `telemetry_errors` | `GET /api/1/vehicles/{vin}/fleet_telemetry_errors` | each health check | Data |
| `region` | `GET /api/1/users/region` | a sign-up | Data |
| `wake` | `POST /api/1/vehicles/{vin}/wake_up` | never | Wakes |
| `command` | any `/command/` path | never | Commands |
| `other` | anything else | | Data |

Not counted: `scripts/telemetry-config.mjs` and `scripts/register-partner.mjs`, run by hand.

### The health check: one Tesla answer an hour

`/api/health/stream` is called by an external bot every 15 minutes, and the status page and the poll cron record checks too. Each check needs the car's streaming config and errors from Tesla: 2 requests. Asked every time, the bot alone made 192 requests a day, about $11.50 a month at the Data price, more than the whole credit.

So the health check reuses Tesla's answer for an hour (`lib/server/tesla-stream-state.ts`). It is stored in `tesla_answer_cache`, so every server instance shares it, and asked again after an hour or for another car. An answer whose errors read failed isn't kept. The other checks (the receiver reachable, the last reading against the last time online, the database) stay live on every call. The route's JSON says when Tesla was last asked: `config.fetched_at`.

That's 48 requests a day, about **$2.90 a month**, whoever calls. Until the migration adds the table, every check asks Tesla as before. A config change or a new error shows up within the hour, not the 15 minutes. The budget guard doesn't slow the health check.

### Checks

Each car check is the vehicle list, `vehicle_data` for each online car, and the charging history (one page, more on a car's first check): about 3 requests, $0.006. Every 12 hours that's about $0.36 a month per user with one car.

### Streaming signals

The car streams through the Fly receiver (`fly/telemetry/worker.ts`), which writes one `telemetry_readings` row per field per record. Uplink counts **rows inserted**, per VIN per UTC day, in the daily retention cron (`count_telemetry_signals`, see the migration), before the prune runs. Each run recounts the last 3 days from `received_at`, and sets each day's total rather than adding to it, so a cron that fires twice can't double count and a late upload is caught the next day.

Why this and not a counter in the receiver:
- The receiver deploys itself on every push, and a counter there would need a VIN-to-user lookup it doesn't have until step 4. The rollup needs no receiver change.
- It is one query a day over 3 days of rows, against one small write per 10-second batch for the receiver.
- It undercounts a little, so it reads low rather than high. Rows not written are not counted:
  - fields the receiver drops (`Media*`, `Semitruck*`, `Experimental_*`, `Deprecated_*`) and values that are null or `<invalid>`;
  - resends skipped by the unique key `(vin, field, created_at)`;
  - rows lost when the receiver's buffer overflows or Supabase refuses a batch;
  - rows retention deletes before they are counted (only a resend more than 7 days old, inside the same day).

  Tesla doesn't say whether it bills these. A receiver counter would catch the first three.
- The count lags by up to a day. At about 1,000 signals an hour, a car streams about $4.80 of signals a month.

## The budget guard

`TESLA_BUDGET_USD` (default 10, the credit) is what the developer account may spend in a month, by Uplink's estimate: the month-to-date total of every user's requests, the unattributed ones and the streamed signals.

| Month to date | Checks |
| --- | --- |
| Under 80% of the budget | Every 12 hours |
| From 80% | Every 24 hours |
| From 100% | Stopped until the 1st |

When stopped, nothing optional calls Tesla either: the station check and the Charging page's history sync are skipped. Streaming is left alone. A sign-in still signs in, but its check is skipped. The health checks, invoices and Disconnect are never skipped.

If the usage can't be read (the table isn't there yet), checks stay at every 12 hours.

### What it means for the owner alone, before anyone else joins

An estimate at the Data price, with one car streaming about 1,000 signals an hour (Tesla's own example; Uplink asks for nearly every field, so it may stream more):

| Source | A day | 30 days |
| --- | --- | --- |
| Health check, 48 requests (one config and errors pair an hour) | $0.10 | $2.88 |
| Streaming, about 24,000 signals | $0.16 | $4.80 |
| Checks, about 12 requests | $0.02 | $0.72 |
| **Total** | **about $0.28** | **about $8.40** |

Before the health check reused its answer (below), the bot alone asked 192 times a day: $11.52 a month, and about $17 in all.

So with the defaults, checks would slow to every 12 hours only in the last two or three days of a long month, and wouldn't stop. That rests on the streaming guess: a car that streams twice as much would reach the budget around the 23rd. **Stopping checks doesn't stop the spend**: the health check and streaming carry on past the budget. If Tesla's "billing limit of 0" means access stops at the credit, streaming could stop then too.

The owner's options, if the counts run higher:
- compare Uplink's figure with Tesla's billing page after a few days, before relying on either;
- if Tesla prices `fleet_telemetry_config` or `fleet_telemetry_errors` below Data, change `CATEGORY_OF` in `lib/tesla-billing.ts`;
- reuse the health check's answer for longer (`TESLA_ANSWER_MS` in `lib/server/tesla-stream-state.ts`), or call the bot less often;
- raise `TESLA_BUDGET_USD`.
