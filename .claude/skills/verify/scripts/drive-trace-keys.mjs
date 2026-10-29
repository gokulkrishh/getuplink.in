// Keyboard pass on a drive page's traces (speed, power, climate…).
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";
const dir = evidenceDir("line-keys");
const { browser, page, errors } = await open({ phone: process.argv.includes("--phone") });
await page.goto("/stats/driving?period=month", { waitUntil: "networkidle" });
const href = await page.locator('a[href^="/stats/driving/"]').first().getAttribute("href");
console.log("drive:", href);
await page.goto(href, { waitUntil: "networkidle" });
const plots = page.locator('[role="group"][tabindex="0"]');
const n = await plots.count();
console.log(n, "plots");
for (let i = 0; i < n; i++) {
  const plot = plots.nth(i);
  await plot.scrollIntoViewIfNeeded();
  await plot.focus();
  await page.keyboard.press("ArrowLeft");
  const a = await plot.locator('[role="status"]').first().textContent();
  await page.keyboard.press("Home");
  const b = await plot.locator('[role="status"]').first().textContent();
  if (i === 1) await page.screenshot({ path: join(dir, `drive-${process.argv.includes("--phone") ? "phone" : "desk"}.png`) });
  await page.keyboard.press("Escape");
  console.log(i, a, "|", b, "|", await plot.locator('[role="status"]').count());
}
console.log("errors:", errors);
await browser.close();
