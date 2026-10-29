# Later

Ideas and known small issues that are decided but not scheduled. Move an item into a branch when it's picked up, and delete it here once it ships.

## Features

### Support access (opt-in, read-only)
For bug fixes, the operator sometimes needs to see what an owner sees. A silent "log in as anyone" is out: Uplink holds where cars have been, local and live share one database (so "localhost only" still shows live data), and the privacy page promises database access only "to run and fix Uplink". Instead:

1. A "Let Uplink help" switch in Settings, turned on by the owner (often after reporting a bug). It turns itself off after 24 hours.
2. While it's on, the admin can open that owner's pages read-only, with a banner naming whose view it is. Nothing can be changed or done as them.
3. Every view is logged, and the owner sees "Viewed by Uplink at 3:10 PM" in Settings.
4. Maps and places stay hidden unless the owner also ticks "include my trips".
5. One line on the privacy page describing it.

Size: medium (a table for grants and views, the Settings switch, a read-only view mode, the log). Research uses totals across owners (Owners page) or demo data, never one account.

### Alerts bell, after 1 to 5 ship
- "Update ready for <car>" under "Good to know", from `pendingUpdate`. It clears itself once installed.
- Recent activity: new connector, sharing turned on, data deleted. Needs a small `owner_events` table, which is also where read or dismiss state would live.
- Web push only for "key removed" and "car quiet for over 24 hours". Needs a service worker, a `push_subscriptions` table, VAPID keys and a permission prompt. On iPhone it works only for an installed app.

### Demo scenarios
Demo mode can't show the waitlist after sign-in, a valid invite, a removed key, or the bell with alerts. Adding these as `?scenario=` states would let `verify-uplink` and `launch-qa` reach them.

## Small issues (from the 29 Oct 2026 launch QA)
- After a dropped connection, the Delete confirm box in Settings clears the typed word (`app/settings/confirm-actions.tsx`: control the input's value).
- A nonsense custom period (`?period=custom&from=xx`) quietly shows the last 30 days with no note (`components/stats/periods.ts`, `urlRange`).
- React "unique key" warning on a trip page, from `TripMap` (`components/stats/trip-map.tsx`, maybe the `key` spread through `tipOn`).
- Home idioms: "all in one place", "Updates show up on their own", "keeps the rest".
- Settings > Advanced connector steps still use "header", "Bearer" and "API key". These are allowed where the owner must type them, but could explain more.
- The Grok bot link in Settings > Advanced doesn't say what the bot can read.
- A few inline links are 22 to 26px tall (email links on /home and /waitlist, Privacy on /terms).
- On slow 3G the full load takes 16 to 26 s on a dev server. Measure a production build before acting.
