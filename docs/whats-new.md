# Release notes

How Uplink tells owners about new things. Rules are in `lib/whats-new.ts` (tested by `test/whats-new.test.ts`); the reads and writes are in `lib/server/whats-new.ts`.

## What owners see

- **Welcome tour** on Home, once, for every owner who hasn't closed it yet, new and existing: a dialog over a blurred page with 5 steps, each a headline, one lead line and three points (Home, Stats, Updates, Compare, Settings). The left half is a screenshot of the real page, in the app's own theme, with an outline round the part the step is about and a pointer that glides to it; the right half has the words, under the step's name in grey (no "Welcome" chip). It moves on by itself like a slider on apple.com: the step dots sit in a soft capsule, the step showing is a pill that fills over 8 seconds, and a round button beside them pauses, plays, or at the end plays again from the start. Any move by hand (Next, Back, a dot, a swipe on the picture, an arrow key) stops it, and it never moves by itself for someone who prefers reduced motion. On a phone it is a sheet from the bottom. Skip, the cross, Esc, "Got it" and, on a phone, a swipe down close it for good; tapping outside does not. A sideways swipe on the picture changes step and never closes it. On Home and the menu step only the part the step is about is sharp, the rest blurred and dimmed; on Stats, Updates and Compare the whole page stays sharp. "Take the tour", at the top right of the Release notes page, replays it any time and writes nothing.
- **Release dialog** on Home, for the big (`dialog`) entries the owner hasn't seen: the same dialog as the tour, one step for each entry, newest first, at most 3. Left, the entry's screenshot; right, a tinted "New" chip with "Version 0.4" in grey, the title and the words. When there are more than 3, a quiet "See all in Release notes" link sits under the words. Closing it (the cross, Skip, "Got it", Esc or, on a phone, a swipe down; not a tap outside) marks seen up to the newest entry it showed, so it shows once. A newer `bell` entry the dialog didn't show keeps its bell line.
- **A line in the bell**, under "Good to know", for every unseen entry, either level.
- **The Release notes page** at `/release-notes` (account menu), laid out like a Tesla's release notes. A version picker ("Version 0.4 · 24 Nov", latest first; the date is the newest entry in it) sits under the heading. On a desktop a list of that version's features (title, kind) is on the left and the selected one on the right: its screenshot, then its title and words. Up and Down move the selection. On a phone it is the list alone, and a tapped row opens under itself, one at a time, with the same picture box as the desktop pane. The first feature is open at first, and changing the version goes back to its first. The screenshot's box is as tall as the tallest one in the version, so nothing moves between features; a shorter picture sits centred in it. A small blue dot marks a feature that was new to the owner when they opened the page; it stays for that visit and is gone the next. No dot on the account menu: the bell already has one.

Home shows the welcome tour first, then the release dialog. Under the week's tiles the share card shows only when neither dialog does. Home shows one prompt card there at a time (`promptCard` in `lib/share-nudge.ts`): a due share card wins, and the Tips box waits until the next day, since the share card's window is one rare day and tips come back daily.

## Dialog, bell or nothing

| Level | Use it for | Shows |
| --- | --- | --- |
| `dialog` | A big feature or a visible change most owners should notice, like Guest access or a new page | Release dialog on Home, bell line, page |
| `bell` | A smaller addition: a new chart, a new detail on the Car page, a new Settings option | Bell line, page |
| no entry | Bug fixes, wording, speed, behind-the-scenes work | Nothing |

At most 3 `dialog` entries per version, and a `dialog` entry needs a screenshot (tests check both). Bug fixes never get an entry.

## Adding an entry

Add it at the top of `WHATS_NEW`. Entries are release notes: `kind` (`"New feature"` or `"Improvement"`, shown under the title in the list), `version` (Uplink's version, like "0.2"; it never goes down down the list), `date`, `title`, `text`, optional `more`, and an `image`. Write the words with the `uplink-copy` skill. The id is the date and a short name (`2026-10-30-guest-access`), so ids sort by date.

The screenshot is a file in `public/whats-new/` (`/whats-new/name.webp`), about 1200px wide and under 120 KB, cropped to the part the entry is about. `image` holds its `src`, `alt` (plain words, same copy rules) and the file's real `width` and `height`, so the page keeps the space before it loads. A draft may have no image yet; an entry can't leave draft without one (`test/whats-new.test.ts` checks the file exists). Entries have no buttons or links.

Entries start with `audience: "draft"`: shown to nobody, and only the owner flips the audience. Once the feature is live on main, change it to `"admin"` (only the admin sees it, to check it) and then to `"owners"`.

An entry reaches only owners approved before its date (India time). An owner approved after it joined with the feature already there, so they aren't told about it.

## Seen

One marker per owner: the id of the newest entry they have seen. Opening the page moves it to the newest entry they can see, which clears the bell lines too. Closing the release dialog moves it to the newest entry the dialog showed (the server checks it is an entry they can see). It only moves forward. Closing the welcome tour also sets it, so a new owner never gets older news; the welcome itself is written on its own first, so it is never lost if the marker moved in between.

## Storage

Two columns on `users` (`supabase/migrations/20261117120000_whats_new.sql`): `welcomed_at` (when the welcome tour was closed) and `whats_new_seen` (the marker). Before the migration runs, Home shows neither dialog, the bell shows no lines, and the page still lists entries.

## Guests

Someone viewing a shared car (Guest access) sees only the guest tour: 5 steps (Guest mode, then Home, Stats, Updates and Compare, the same pictures as the owner tour), once per browser. Closing it any way sets the cookie `uplink-guest-tour=seen` (a year, whole site); while it is there the tour never opens. No server action, no database, and never the owner tour, the release dialog, bell lines or the Release notes page for a guest. `GuestTour` (in `components/home/welcome-tour.tsx`) isn't mounted on main yet. To wire it in on the view-links branch: on Home, render `<GuestTour />` when `reader.viewer !== null`, and skip the owner tour and release dialog then. `UPLINK_DEMO_SCENARIO=guest` shows it on a demo copy.

## The tour's screenshots

The tour's pictures are real screenshots of a demo copy, not drawings: `public/whats-new/tour/<step>-light.webp` and `-dark.webp`, with the outlined part's place as percentages in `lib/tour-targets.ts` (both generated). After any visible change to Home, Stats, Updates, Compare or the account menu, rerun `bun --install=force scripts/tour-shots.mjs <port>` against a plain demo (`UPLINK_DEMO_SCENARIO= .claude/skills/verify/scripts/launch.sh 3223`). It writes nothing real.

## Demo

`UPLINK_DEMO_SCENARIO=welcome` shows the welcome tour. `UPLINK_DEMO_SCENARIO=news` shows the release dialog (three big entries), a line in the bell and blue dots on the page. The page lists sample entries in any demo copy. The samples live in `lib/server/demo/whats-new.ts`, never in `WHATS_NEW`. Their screenshots, in `public/whats-new/demo/`, are crops of the demo's own pages and are demo-only samples.
