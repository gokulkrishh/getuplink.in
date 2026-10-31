# Product analytics (draft, not scheduled)

Notes for agents. Uplink has no product analytics today, on purpose: with a handful of owners the admin can ask each one. This is the plan for when there are enough owners that asking stops working. Nothing here is built.

## When to pick it up

The owner's decision: once there are enough users. As a guide, any of these:

- Approved owners pass about 25, or the owner raises `MAX_USERS`.
- Before opening the next tier of invites, so it's clear whether the last tier stayed.
- Before a pricing test, which needs a before and after.

## What it should answer

| Question | Measure |
| --- | --- |
| Do new owners finish setup? | **Activation**: signed in, key added, first drive recorded, each within 48 hours of approval. Where people stop. |
| Do they come back? | **Weekly active owners** (opened the app at least once in the week, IST). The main number. |
| Do they stay? | **Week-4 retention**: of owners approved in a week, how many were active in their fourth week. |
| What do they use? | **Reach** per page and feature: share of active owners who opened it in the last 30 days. |
| Did a release land? | Reach of a feature in the two weeks after its What's new entry. |

Five numbers, no more. Anything that doesn't change a decision isn't counted.

## Privacy rules

These follow the privacy page ("No tracking or analytics cookies") and `docs/legal-review.md`.

- **First party only.** No third-party script, no new cookie, no fingerprinting. Events are recorded on the server from requests Uplink already serves.
- **Names, not content.** An event is a name, the owner's `user_id` and a time. Never a location, place name, VIN, route, amount or anything typed.
- **Admin sees totals.** Admin shows counts and shares across owners, never one owner's activity list.
- **Kept briefly.** Raw events are deleted after 90 days. Weekly totals (counts only, no `user_id`) are kept.
- **Deleted with the owner.** Delete my data and Delete account remove the owner's events.
- **Demo and admin don't count.** Demo mode records nothing. The admin's own events are left out of totals.
- **Said on the privacy page.** One line saying Uplink counts which pages owners open, to improve it, and keeps no tracking cookies. Write it with the `uplink-copy` skill.

## Design sketch

- **Table** `owner_events (user_id, name, at)`, additive migration. `docs/later.md` already plans this table for the alerts bell's read state, so build it once for both.
  - Add it to `OWNER_TABLES` (`lib/server/data/owner.ts`) so `ownerDb()` is the only way to write it and `erase.ts` deletes it.
  - Index on `(name, at)` for the weekly totals.
- **Recording.** One `recordEvent(owner, name)` in `lib/server/data/`, called from server components and actions. Fire and forget: a failed write never fails a page. At most one row per owner, name and hour, so a refresh loop doesn't inflate counts.
- **Event names**, a fixed list in code (a typo is a type error):
  - Setup: `approved`, `signed_in`, `key_added`, `first_data`, `first_drive`.
  - Pages: `open_home`, `open_updates`, `open_charging`, `open_driving`, `open_battery`, `open_car`, `open_owners`, `open_rollout`, `open_release_notes`, `open_settings`.
  - Features: `chart_download`, `guest_link_created`, `share_on`, `tip_vote`, `connector_added`, `invoice_attached`, `place_named`.
  - Setup events may come from rows Uplink already keeps (approval time, key status, first reading) rather than new writes.
- **Weekly roll-up.** The retention cron folds last week into `owner_event_weeks (week, name, owners)` and deletes raw rows past 90 days.
- **Admin.** A small section on Admin > Overview: the five numbers above, this week against last, and the setup funnel. Follow `docs/charts.md` for any chart.

## Alternatives weighed

- **Vercel Web Analytics.** Cookieless and a few lines to add, but page views only: it can't say whether an owner added the key or came back in week 4, and it sends visits to another company. Fine for the public home page's traffic, not for the app.
- **PostHog or similar.** Rich, but a third-party script and per-person tracking, against the privacy page.
- **Asking owners.** What Uplink does now. Keep doing it alongside: numbers say what, owners say why.

## Open questions

- Does the public home page get Vercel Web Analytics for visits and waitlist sign-ups, separate from the app?
- 90 days for raw events: long enough for week-4 retention and a release's reach, short enough to keep little. Confirm when building.
