// Before/after screenshots: the same pages from two demo copies (say main on 3210 and your branch on 3230),
// desktop and phone, saved side by side as <page>-<layout>-before.png / -after.png.
// Run: bun --install=force .claude/skills/verify/scripts/before-after.mjs 3210 3230 /home /setup /settings
import { join } from "node:path";
import { chromium } from "playwright-core";
import { evidenceDir, headlessShell } from "./browser.mjs";

const [before, after, ...routes] = process.argv.slice(2);
if (!before || !after || routes.length === 0) throw new Error("Usage: before-after.mjs <before port> <after port> <route>...");
const dir = evidenceDir(`before-after-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const browser = await chromium.launch({ executablePath: headlessShell() });
const LAYOUTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
for (const [layout, options] of Object.entries(LAYOUTS)) {
  for (const [side, port] of [["before", before], ["after", after]]) {
    const context = await browser.newContext({ baseURL: `http://localhost:${port}`, ...options });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await page.screenshot({ path: join(dir, `${route.replace(/[^a-z0-9]+/gi, "_") || "_"}-${layout}-${side}.png`), fullPage: true });
    }
    await context.close();
  }
}
await browser.close();
console.log("saved", dir);
