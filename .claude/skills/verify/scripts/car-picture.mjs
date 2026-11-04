// The Car page's header with the car's picture: desktop and 375px phone, light and dark.
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE, evidenceDir } from "./browser.mjs";
const dir = evidenceDir(process.argv[2] ?? "car-picture");
const tag = process.argv[3] ?? "car";
const browser = await chromium.launch();
for (const phone of [false, true])
  for (const dark of [false, true]) {
    const ctx = await browser.newContext({
      colorScheme: dark ? "dark" : "light",
      deviceScaleFactor: 2,
      ...(phone ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(BASE + "/car", { waitUntil: "networkidle" });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const name = `${tag}-${phone ? "phone" : "desktop"}-${dark ? "dark" : "light"}.png`;
    await page.screenshot({ path: join(dir, name), fullPage: false });
    const box = await page.locator("header.rounded-lg").first().boundingBox();
    console.log(name, JSON.stringify(box), errors.length ? "errors: " + errors.join(" | ") : "no errors");
    await ctx.close();
  }
await browser.close();
