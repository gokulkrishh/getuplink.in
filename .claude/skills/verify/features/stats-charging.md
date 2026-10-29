# Stats, Charging

Charging for a period: Spend (with what you paid for), Energy added, When you charge, Charge range, DC charging speed, Where you charge, the Charging map, and Charging sessions. Each session opens `/stats/charging/<id>` with its bill details.

## Sub-features

- Period switch, as on Driving.
- Spend tiles (incl. time on AC and DC) and the "What you paid for" breakdown.
- Charge habits grid (buttons with an `aria-label` per cell, tap for a tip).
- Session rows linking to session pages; session page shows Energy charge and Fees when itemised.

## How to get to it (user POV)

Home → Charging → "See all sessions", or Stats → "Charging". Direct: `/stats/charging`.

## Driving it with Playwright

```js
await page.goto("/stats/charging", { waitUntil: "networkidle" });
const sessions = page.locator("section", { has: page.getByRole("heading", { name: "Charging sessions" }) });
await page.getByRole("button", { name: /^Month/ }).click();
await page.waitForURL(/period=month/);
await page.waitForLoadState("networkidle");
const first = sessions.getByRole("link").first();
await first.click();
await page.waitForURL(/\/stats\/charging\/.+/);
```

Proof: the session page's headings and bill lines in `shot.mjs` text output.

## Gotchas

- On Day there may be no sessions ("No charging sessions today."); switch to Month or Year before looking for a row.
- Amounts are rupees with GST; demo invoices are generated, so don't assert exact totals.
