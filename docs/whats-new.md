# What's new

How Uplink tells owners about new things. Rules are in `lib/whats-new.ts` (tested by `test/whats-new.test.ts`); the reads and writes are in `lib/server/whats-new.ts`.

## What owners see

- **Welcome tour** on Home, once, for an owner approved on or after `WELCOME_SINCE` (31 Oct 2026, India time): a dialog over the page with a blurred backdrop and 5 steps (Home, Stats, Updates, Compare, Settings). The left half draws a slice of the app with a pointer that glides to the part the step is about; the right half has the words. Skip, the cross, Esc, tapping outside and "Got it" all close it for good. Owners approved before that date never see it. Settings > General > "Welcome tour" replays it any time and writes nothing. The What's new page keeps its "Where things are" list.
- **What's new card** on Home, for the newest "card" entry the owner hasn't seen. A link underneath counts the others ("2 more on What's new").
- **A line in the bell**, under "Good to know", for every unseen entry.
- **The What's new page** (account menu), listing every entry newest first, with a "Where things are" list.

Home shows the welcome tour first. Under the greeting it shows one card at a time: news, then the share card.

## Card, bell or nothing

| Level | Use it for | Shows |
| --- | --- | --- |
| `card` | A new feature most owners should try, like Guest access | Home card, bell line, page |
| `bell` | A smaller addition: a new chart, a new detail on the Car page, a new Settings option | Bell line, page |
| no entry | Fixes, wording, speed, behind-the-scenes work | Nothing |

## Adding an entry

Add it at the top of `WHATS_NEW`. Write the words with the `uplink-copy` skill. The id is the date and a short name (`2026-11-20-guest-access`), so ids sort by date.

Entries start with `audience: "draft"`: shown to nobody. Once the feature is live on main, change it to `"admin"` (only the admin sees it, to check it) and then to `"owners"`.

An entry reaches only owners approved before its date (India time). An owner approved after it joined with the feature already there, so they aren't told about it.

## Seen

One marker per owner: the id of the newest entry they have seen. Closing the card, tapping its button or opening the page moves it to the newest entry they can see, which clears the bell lines too. It only moves forward. Closing the welcome tour also sets it, so a new owner never gets older news.

## Storage

Two columns on `users` (`supabase/migrations/20261117120000_whats_new.sql`): `welcomed_at` (when the welcome tour was closed) and `whats_new_seen` (the marker). Before the migration runs, Home shows neither card, the bell shows no lines, and the page still lists entries.

## Demo

`UPLINK_DEMO_SCENARIO=welcome` shows the welcome tour. `UPLINK_DEMO_SCENARIO=news` shows the What's new card with "2 more" and a line in the bell. The page lists sample entries in any demo copy. The samples live in `lib/server/demo/whats-new.ts`, never in `WHATS_NEW`.
