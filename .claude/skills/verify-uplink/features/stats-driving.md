# Stats, Driving

Everything about drives for a period: Distance, Energy use and Regen bars, Efficiency by season, Your days timeline, Time at each speed, Efficiency by temperature, Places (map and list), Drive stats, and the Trips table. Each trip opens a trip page with its legs and map.

## Sub-features

- Period switch (Day, Week, Month, Year, All, Custom); every section follows it.
- Charts with hover and tap tips.
- Places map (MapLibre) and the place list; "Name this place" opens a naming sheet.
- Trips table (desktop) and trip list (phone); each row links to `/stats/driving/<start>`.
- Trip page: h1 "Drive", legs table (rows link to `?leg`), route map.

## How to get to it (user POV)

Home → "See all trips", or the header's Stats tabs → "Driving". Direct: `/stats/driving`.

## Driving it with Playwright

Ready-made proof run (period switch, then a trip):

```bash
bun --install=force .claude/skills/verify-uplink/scripts/drive-driving.mjs           # desktop
bun --install=force .claude/skills/verify-uplink/scripts/drive-driving.mjs --phone   # phone list layout
```

It prints the `aria-pressed` state before and after switching to Week, the trip it opened, and errors, and saves `1-default.png`, `2-week.png` and `3-trip.png` under `$TMPDIR/uplink-verify-evidence/driving[-phone]/`.

Keyboard focus on rows: `await row.focus()` then screenshot; the focused row shows a 2px outline.

## Gotchas

- Wait for `networkidle` plus ~500 ms after a period click; `aria-pressed` reads stale before the transition ends.
- The map needs WebGL; headless Chromium renders it, but tiles come from the network (CARTO), so a blank map offline isn't an app bug.
- A dev-only React warning about a spread `key` prop on Distance and EnergyUse has shown up in the browser console during first compiles; it's a real finding, not harness noise.
