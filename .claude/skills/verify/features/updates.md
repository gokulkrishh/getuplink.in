# Software updates

The car's software: the current version and any download in progress (Software), the version History, and Stats on update timing. (Awake and asleep moved to `/stats/battery`.)

## Sub-features

- Software card: current version, download or install progress.
- History table of versions (received, installed, odometer); sideways scroll on phones.
- Stats with its own period switch: Month, Year, All, Custom (no Day or Week; opens on Month).

## How to get to it (user POV)

Header → "Updates", or Home's software line → Details. Direct: `/updates`.

## Driving it with Playwright

```js
await page.goto("/updates", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Year/ }).click();
await page.waitForURL(/period=year/);
await page.waitForLoadState("networkidle");
```

Proof: `Month` is pressed on a fresh `/updates` with no `?period`; after the click, `Year` is pressed and the URL has `?period=year`.

## Gotchas

- Updates' default is Month, not Week: `PAGE_PERIODS.updates` in `components/stats/periods.ts` leaves out Day and Week.
- On phones the History table scrolls sideways; screenshot with `--phone` and check nothing overflows the page.
