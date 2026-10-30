# What's new

How Uplink tells owners about new things. Rules are in `lib/whats-new.ts` (tested by `test/whats-new.test.ts`); the reads and writes are in `lib/server/whats-new.ts`.

## What owners see

- **Welcome card** on Home, once, for an owner approved on or after `WELCOME_SINCE` (31 Oct 2026, India time). It says where everything else is. Owners approved before that date never see it. Once closed it never comes back; Settings > General > "Where things are" opens the same list on the What's new page any time.
- **What's new card** on Home, for the newest "card" entry the owner hasn't seen. A link underneath counts the others ("2 more on What's new").
- **A line in the bell**, under "Good to know", for every unseen entry.
- **The What's new page** (account menu), listing every entry newest first, with the same "Where things are" list as the welcome card.

Home shows one card at a time: welcome, then news, then the share card.

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

One marker per owner: the id of the newest entry they have seen. Closing the card, tapping its button or opening the page moves it to the newest entry they can see, which clears the bell lines too. It only moves forward. Closing the welcome card also sets it, so a new owner never gets older news.

## Storage

Two columns on `users` (`supabase/migrations/20261117120000_whats_new.sql`): `welcomed_at` (when the welcome card was closed) and `whats_new_seen` (the marker). Before the migration runs, Home shows neither card, the bell shows no lines, and the page still lists entries.

## Demo

`UPLINK_DEMO_SCENARIO=welcome` shows the welcome card. `UPLINK_DEMO_SCENARIO=news` shows the What's new card with "2 more" and a line in the bell. The page lists sample entries in any demo copy. The samples live in `lib/server/demo/whats-new.ts`, never in `WHATS_NEW`.
