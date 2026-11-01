# Stats, Charging

Charging for a period, opening on Month: Spend, What you paid for (only when the bills have more than one kind of line, such as an idle fee or GST), Energy added, Charging sessions and the Charging map, then the closed fold "Your charging habits" holding Charge range, When you charge and DC charging speed. Each session opens `/stats/charging/<id>` with its bill details.

## Sub-features

- Period switch, as on Driving, but Month is the default (no `?period` in the URL); Week adds `?period=week`.
- Spend tiles (incl. time on AC and DC) and the "What you paid for" breakdown (hidden when every bill is only "Charging").
- "Your charging habits" fold: `getByRole("button", { name: /Your charging habits/ })`; closed, its sections are in the page but hidden, so open it before measuring or reading them.
- Charge habits grid (buttons with an `aria-label` per cell, tap for a tip).
- Session rows linking to session pages; session page shows Energy charge and Fees when itemised.

## How to get to it (user POV)

The "Charging" page link (header, or the tab bar on a phone), or Home → Charging → "See all sessions". Direct: `/stats/charging`.

## Driving it with Playwright

```js
await page.goto("/stats/charging", { waitUntil: "networkidle" });
const sessions = page.locator("section", { has: page.getByRole("heading", { name: "Charging sessions" }) });
await page.getByRole("button", { name: /^Year/ }).click();
await page.waitForURL(/period=year/);
await page.waitForLoadState("networkidle");
const first = sessions.getByRole("link").first();
await first.click();
await page.waitForURL(/\/stats\/charging\/.+/);
```

Proof: the session page's headings and bill lines in `shot.mjs` text output.

## Gotchas

- On Day there may be no sessions ("No charging sessions today."); switch to Month or Year before looking for a row.
- Amounts are rupees with GST; demo invoices are generated, so don't assert exact totals.
