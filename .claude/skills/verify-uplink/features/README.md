# Uplink feature map

One file per user-facing feature: what it is, how a user gets there, how to drive it with Playwright (`scripts/browser.mjs`), and what proves it works. All routes are on the demo instance, `http://localhost:3210`.

| Feature | Route | File |
| --- | --- | --- |
| Home: the car now, period tiles, Driving/Charging/Battery previews | `/` | [home.md](home.md) |
| Stats, Driving: charts, places, trips, trip pages | `/stats/driving`, `/stats/driving/<start>` | [stats-driving.md](stats-driving.md) |
| Stats, Charging: spend, sessions, session pages | `/stats/charging`, `/stats/charging/<id>` | [stats-charging.md](stats-charging.md) |
| Settings: theme, live data, integrations, account | `/settings` | [settings.md](settings.md) |
| Software updates: current version, history | `/updates` | [updates.md](updates.md) |

Not mapped yet: `/car`, `/stats/battery`, `/stats/day/<date>`, `/rollout`, `/status`, `/setup`, `/admin/*` (admin pages need a real admin session; demo mode isn't one), `/invite/<token>`, the public home at `/home`.
