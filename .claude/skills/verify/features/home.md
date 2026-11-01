# Home

The signed-in landing page: the car's state (battery, range, charging, software), four period tiles (Driven, Energy used, Energy added, Spent), and short Driving, Charging and Battery sections that link to the Driving, Charging and Battery pages.

## Sub-features

- Car header: "Your car", the car's name and model, "Synced <n> ago".
- Battery and charging line ("66%", "Charging at 7.2 kW to 80%") and the software line with a Details link.
- Period switch (Day, Week, Month, Year, All, Custom) driving the tiles and sections.
- Tiles with "vs yesterday" (Day) or the period's comparison, each linking to its page (Driving, Charging or Battery).
- Driving section: Distance bars and the trips table; "See all trips". Charging: Spend, "See all sessions". Battery: Parked now, Charge level.

## How to get to it (user POV)

Open the app; it's `/`. The logo in the header returns here.

## Driving it with Playwright

```js
await page.goto("/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Month/ }).click();
await page.waitForURL(/period=month/);
await page.waitForLoadState("networkidle");
await page.getByRole("link", { name: "See all trips" }).click(); // lands on /stats/driving
```

Proof of the default period: on a fresh `/`, the `Week` button has `aria-pressed="true"` and the URL has no `?period`.

## Gotchas

- The period switch runs in a transition: wait for `networkidle` (and a short pause) before reading `aria-pressed` or tile values.
- Demo data shifts with the clock: values like "12.9 km" change between runs. Assert on structure (labels, links, states), not exact numbers.
- Demo mode always shows the "normal" scenario here; the other scenarios in `lib/demo.ts` aren't reachable from the URL.
