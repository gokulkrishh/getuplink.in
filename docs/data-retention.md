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

The lease only works if a token request and its save are over before it runs out. Every request to Tesla (token and Fleet API) gives up after 10 s (`TESLA_TIMEOUT_MS`). An invoice PDF, streamed on to the browser, is bounded only until Tesla answers, not while it downloads. A 4xx, or a 503 (Tesla turning requests away), releases the lease at once, so a Tesla outage that refuses requests doesn't make every caller wait 30 s. No answer (a timeout, a dropped connection), a 200 that can't be read, or a 500, 502 or 504 (a gateway that gave up while Tesla may still have spent the token) leaves the lease to run out: sending a spent token is what signed the owner out on 25 Oct. The new pair is saved with up to 3 tries of up to 4 s each (`SAVE_TIMEOUT_MS`), since losing it after the old token is spent signs the owner out. The claim itself also gives up after 4 s, since the lease's clock starts before it: 4 s + 10 s + 3 × 4 s + the gaps is about 27 s, inside the lease. The other database calls around a refresh (waiting for another instance's tokens, releasing the lease) have no time limit, but none sends a token to Tesla. If all 3 saves fail, the error is logged loudly, and the check reads "didn't finish", not "Tesla didn't respond". A request given up on is still counted against the Tesla budget, since Tesla may have answered it. One case stays open: if Tesla spends the token and the answer is lost, the next refresh after the lease sends the spent token, and the owner has to sign in again.

## When a car stops sending data

A car streams only while Uplink's virtual key is on it. Remove the key (on the car's Locks screen, in the Tesla app, after some service visits) and Tesla drops the streaming config with it: the car sends nothing, and pages keep showing the last data. Seen on 28 Oct 2026: Sentry Mode turned on in the Tesla app never showed.

How it's caught:

- The half-hourly health check (`lib/server/stream-health.ts`) asks Tesla about one car and keeps what it says on the car's row: the key (`recordKeyStatus`), the config's expiry (`recordConfigExpiry`), and the config's state when it differs from the row (`recordStreaming`). A config lost from the car then reads "none", so the next /setup visit or scheduled check (every 12 hours, or 24 once the Tesla budget is 80% spent: `CHECK_EVERY_MS`; rereading within 10 minutes) sends it again, instead of a stale "synced" waiting a day. Seen on 29 Oct 2026: the row said synced from a read before the parse fix while Tesla said the car had no config.
- That car's own state never marks "Live car data" on the status page or Health. Only Uplink's side does (`streamPart` in `lib/stream-health.ts`): no data while cars running Uplink's config were awake (fleet-wide), Tesla's API failing, receiver errors Tesla reports, or our own read failing. A car's key, config, expiry or disconnected account is its owner's, in their bell.
- That answer can be up to an hour old (`tesla_answer_cache`), so it is kept only when it is at least as new as the stored one (`saveKeyStatus`): a key /setup just confirmed isn't undone by the next check. Seen on 29 Oct 2026, when the 02:30 check put back the 02:00 "no key" over /setup's 02:21 "key added".
- A removed key also clears the stored streaming answer. When /setup or the scheduled check sees the key back, it asks about streaming in the same pass, and sends the config again if the car lost it.
- The bell drops a health check's key or config problem once /setup has a good answer from after that check (`SETTLED_BY_SETUP` in `lib/alerts.ts`). On /setup, the bell waits for the page's own check before reading.
- A car marked synced that has never sent data has its config reread every 10 minutes instead of once a day (`streamingStale`, `streamingDue` in `lib/server/setup.ts`), at the scheduled check or a /setup visit, and the config sent if Tesla says there is none. Its first data ends this. Seen on 29 Oct 2026: a new owner's car was marked synced at sign-up from Tesla's `{synced: true, config: null}`, so no config went out, and its first drive the next morning was lost while the row waited a day.
- Every other owner's paired key is rechecked when they open the app, after an hour if their cars have sent nothing for an hour (`keyStale`, `SILENT_RECHECK_MS` in `lib/setup-status.ts`). A car sending data plainly has its key, so this costs nothing until a car goes quiet.

How it's shown:

- The header's alerts bell (`lib/alerts.ts`, `lib/server/alerts.ts`) lists each alert with where to fix it, in two parts. Built from stored answers only, never asking Tesla.
  - **Needs you** (only these light the blue dot and count in the bell's label): the key not on a car (/setup); a car's streaming access running out within `EXPIRY_WARN_DAYS` although Uplink tried to renew it (/setup); a car with the key that has sent no data for over a day although Uplink's check saw it awake after its last data (/setup, with "since" its last data); an unpaid Supercharger balance (home); Tesla not connected or the last check failed (Settings); and for the admin a part of Uplink not working (/admin), minus any problem a car's own row already says.
  - **Good to know**: a car at a Tesla service centre, and a key Tesla was asked about but didn't answer for (Uplink asks again on its own).
- A row shows "since …" only when the start is known. Today that is only the quiet car, from its last data: a key or flag answer's time is when Uplink last asked, not when the problem began.
- A non-admin owner without the key is sent to /setup. The admin is never redirected, but sees the one red note under the header instead. No other note sits under the header, and the home and Updates footers no longer repeat a failed check: the bell has both.

### Streaming access running out

Each car's config carries an expiry (`exp`, set to 360 days ahead when Uplink sends it, `TELEMETRY_EXP_DAYS`). Uplink keeps it on the car's row (`vehicles.telemetry_config_expires_at`, `supabase/migrations/20261113120000_config_expiry.sql`) whenever it reads the config: /setup, its Check again and the scheduled check (`refreshStreaming`), and the health check for its one car (`recordConfigExpiry`, kept only when /setup hasn't read it since). Before that migration nothing is kept and the warning is simply missing.

Uplink renews it on its own: `shouldSendConfig` (`lib/setup-status.ts`) sends a fresh config to a car with the key whose config runs out within `RENEW_WITHIN_DAYS` (30), from the expiry read in the same pass, once per window (`renewalSent`: Tesla may keep answering with the old exp until the car takes the new one, so a second send would just repeat), and only with the location scope and signing keys a first send needs. A config answer without a readable exp never wipes a stored expiry (`expiryToRecord`). Tesla holds a taken renewal as "pending" until the car wakes; the next read (within 10 minutes of a /setup visit or the scheduled check) brings the new expiry. A warning therefore means the renewal hasn't taken: when one was sent for this config the bell says to wake the car in the Tesla app, otherwise to open setup to see what's needed. While a renewal waits for the car, /setup's streaming step shows it waiting, as for a first config.

### A car gone quiet

The bell reads each paired car's newest data from its presence fields (`carLastReadingAt`, one indexed lookup per field), and compares it with the latest time the scheduled check found the car awake (`vehicles.last_seen_at`). A car parked asleep for days sends nothing and isn't flagged; one seen awake two hours or more after its last data, with that data over a day old, is.

To fix a removed key: approve the key again at https://tesla.com/_ak/app.getuplink.in (the car awake), then open /setup, which sends the streaming config again.
