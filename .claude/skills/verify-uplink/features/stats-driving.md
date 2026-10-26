# Stats, Driving

Everything about drives for a period. On Week (the default): Distance (bars, with the energy it took in the tips and in one line under the chart), Your days timeline, Efficiency by temperature and speed, Places (map and list), Drive stats, and the Trips table: 6 sections. Year, All and a Custom range of 90 days or more add Efficiency by season (after Distance) and Time at each speed (after Your days): 8 sections. Each trip opens a trip page with its legs and map.

## Sub-features

- Period switch (Day, Week, Month, Year, All, Custom); every section follows it.
- Charts with hover and tap tips. A Distance bar's tip: the date, km, kWh used, Wh/km, then "Open day" / "Open month".
- Under the Distance chart, one line like "14.5 kWh used, 2.6 kWh won back with regen, 111 Wh/km, 4 Wh/km better than the 7 days before." (only the parts known; with no energy reading the caption names the bars' span instead).
- Places map (MapLibre) and the place list; "Name this place" opens a naming sheet.
- Trips table (desktop) and trip list (phone); each row links to `/stats/driving/<start>`.
- Trip page: h1 "Drive", legs table (rows link to `?leg`), route map.

## How to get to it (user POV)

The header's "Stats" link, Home → "See all trips", or the Stats tabs → "Driving". Direct: `/stats/driving`.

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
- A dev-only React warning about a spread `key` prop on Distance has shown up in the browser console during first compiles; it's a real finding, not harness noise.
- Efficiency by season and Time at each speed are absent on Day, Week and Month by design; switch to Year to see them.
