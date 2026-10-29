# Data retention, the drive archive and car alerts

Notes for agents: what Uplink keeps, for how long, and how it notices when a car stops sending data.

## How long readings are kept

The Fly receiver stores every streamed reading in `telemetry_readings`, once per car (VIN). The daily retention run (`app/api/cron/retention`, 3 AM IST) deletes each field past its keep, set in `lib/telemetry-retention.ts` from what reads it. Change that table with the reader, or retention deletes what a page needs.

| Kept | Fields (examples) |
| --- | --- |
| Forever | Odometer, battery level, energy remaining, full pack energy, lifetime energy counters, charge state, AC and DC charging power, pack temperature. Each car's newest reading of every field. |
| 120 days | A drive's detail: speed, location, gear, acceleration, pack voltage and current, grade, inside and outside temperature |
| 14 to 22 days | Cell voltages, state of charge, isolation resistance (awake and asleep presence) |
| 7 days | Any field nothing reads (`DEFAULT_KEEP_DAYS`) |

Charging sessions, Supercharger history, invoices and version history are their own tables and are kept. Monthly driving totals come from the counters at month boundaries, kept forever. Measured on the owner's car in Oct 2026: about 4 to 5 MB of readings a driving day, nearly all of it drive detail, which is why that detail isn't kept forever.

## Drives outlive their readings

Drives aren't stored rows: `buildDrives` (`lib/drives.ts`) rebuilds them from Gear, Odometer and battery readings, over the last `DRIVE_DAYS` (90). So without help a trip would vanish once its readings are deleted.

Each night at 2:30 AM IST, half an hour before retention, `app/api/cron/archive` stores every finished drive not yet archived in `drive_archive` (`supabase/migrations/20261112120000_drive_archive.sql`): one row per car and drive start, with the `Drive` the trip list shows and a slimmed copy of the readings its trip page and places read (`ARCHIVE_FIELDS`, `lib/drive-archive.ts`). Readings are thinned to 30 s slots: numbers keep each slot's lowest and highest (so a hard stop or power peak keeps its true value), a location one fix a slot, flags every change. About a fifteenth of the rows, stored as one JSON per drive.

Reading back needs no special code in pages:

- `loadWindowStats` adds archived drives from before its window (`withArchivedDrives`), so trip lists go back to the first drive archived.
- `loadReadingsByField` merges the archived readings into any window older than the readings kept. Every archived reading is a copy of a real one, so the merge drops duplicates by field and time. An old trip's page, route and places read as a recent one does, a little coarser.

Archived drives follow the readings' privacy rules: each user reads them through `user_drive_archive` (only drives that started inside their window on the car), and `forget_unseen_drive_archive` deletes them with the readings (Delete my data, and the daily sweep). Speed bands and efficiency still need full readings, so they cover the last 90 days only. Nothing from before a car was connected can be fetched: Tesla's Fleet API answers only what the car is doing now, and keeps history only for Supercharger sessions (read back to 2012, `lib/server/charging.ts`).

## Tesla tokens: one refresh at a time

Tesla's refresh tokens are single use, and presenting a spent one can revoke the whole chain, the pair just stored included. That logged the owner out on 25 Oct 2026 when two requests refreshed at once. `lib/server/tesla.ts` allows one refresh at a time: requests in an instance share one, and across instances the first claims a 30 s lease (`refreshing_until`) while the others wait for the tokens it stores. `test/tesla-refresh.test.ts` reproduces the outage against the old code.

## When a car stops sending data

A car streams only while Uplink's virtual key is on it. Remove the key (on the car's Locks screen, in the Tesla app, after some service visits) and Tesla drops the streaming config with it: the car sends nothing, and pages keep showing the last data. Seen on 28 Oct 2026: Sentry Mode turned on in the Tesla app never showed.

How it's caught:

- The half-hourly health check (`lib/server/stream-health.ts`) asks Tesla about one car and keeps the key answer on its row (`recordKeyStatus`).
- That answer can be up to an hour old (`tesla_answer_cache`), so it is kept only when it is at least as new as the stored one (`saveKeyStatus`): a key /setup just confirmed isn't undone by the next check. Seen on 29 Oct 2026, when the 02:30 check put back the 02:00 "no key" over /setup's 02:21 "key added".
- A removed key also clears the stored streaming answer. When /setup or the 6-hourly check sees the key back, it asks about streaming in the same pass, and sends the config again if the car lost it.
- The bell drops a health check's key or config problem once /setup has a good answer from after that check (`SETTLED_BY_SETUP` in `lib/alerts.ts`). On /setup, the bell waits for the page's own check before reading.
- Every other owner's paired key is rechecked when they open the app, after an hour if their cars have sent nothing for an hour (`keyStale`, `SILENT_RECHECK_MS` in `lib/setup-status.ts`). A car sending data plainly has its key, so this costs nothing until a car goes quiet.

How it's shown:

- The header's alerts bell (`lib/alerts.ts`, `lib/server/alerts.ts`) has a blue dot when something needs the owner, and lists each with where to fix it: the key not on a car (/setup), Tesla not connected or the last check failed (Settings), and for the admin a part of Uplink not working (/admin). Built from stored answers only, never asking Tesla.
- A non-admin owner without the key is sent to /setup. The admin is never redirected, but sees a note under the header instead.

To fix a removed key: approve the key again at https://tesla.com/_ak/app.getuplink.in (the car awake), then open /setup, which sends the streaming config again.
