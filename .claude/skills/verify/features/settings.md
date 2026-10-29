# Settings

The owner's settings: General (Theme, Live data, Home state), Integrations (MCP connector, Uplink Bot), Account (Disconnect, Sign out everywhere) and Your data (Delete my data, Delete account).

## Sub-features

- Theme picker (saved in the browser).
- Live data: sync dot and the check cadence line.
- MCP connector: status, closed "Manual instructions", Connector URL with copy, Create/Replace/Revoke token.
- Uplink Bot: "Add to Grok" link and closed "Manual instructions" with the bot text and a copy button.
- Destructive actions behind typed confirmations.

## How to get to it (user POV)

Header → "Account menu" → Settings. Direct: `/settings`.

## Driving it with Playwright

```js
await page.goto("/settings", { waitUntil: "networkidle" });
const manual = page.locator("summary", { hasText: "Manual instructions" });
await manual.first().click();               // MCP connector's steps
await page.screenshot({ path: join(dir, "connector-open.png"), fullPage: true });
```

Proof for disclosure changes: the summary toggles Show/Hide and the content becomes visible (`toBeVisible` or a screenshot).

## Gotchas

- There are two "Manual instructions" boxes (connector first, bot second); index with `.nth()`.
- Token, disconnect and delete actions are server actions; demo mode has no database, so don't drive them as proof of a real write.
- Theme is per browser: use `open({ dark: true })` for dark mode instead of clicking the picker when only colours matter.
