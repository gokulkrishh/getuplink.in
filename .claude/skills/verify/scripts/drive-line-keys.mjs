// Keyboard pass on every line chart: Tab to the plot, arrows step the tooltip, Home/End jump, Esc and blur clear.
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const dir = evidenceDir("line-keys");
const pages = ["/stats/battery", "/stats/battery?period=all", "/stats/charging", "/stats/driving"];
for (const phone of [false, true]) {
  const { browser, page, errors } = await open({ phone });
  for (const path of pages) {
    await page.goto(path, { waitUntil: "networkidle" });
    const plots = page.locator('[role="group"][tabindex="0"]');
    const n = await plots.count();
    console.log(`${phone ? "phone" : "desk"} ${path}: ${n} keyboard plots`);
    for (let i = 0; i < n; i++) {
      const plot = plots.nth(i);
      if (!(await plot.isVisible())) continue;
      await plot.scrollIntoViewIfNeeded();
      await plot.focus();
      const status = plot.locator('[role="status"]');
      const before = await plot.boundingBox();
      await page.keyboard.press("ArrowLeft");
      const a = await status.first().textContent();
      await page.keyboard.press("ArrowLeft");
      const b = await status.first().textContent();
      await page.keyboard.press("End");
      const c = await status.first().textContent();
      await page.keyboard.press("Home");
      const d = await status.first().textContent();
      const after = await plot.boundingBox();
      if (i === 0) await page.screenshot({ path: join(dir, `${phone ? "phone" : "desk"}-${path.replace(/\W+/g, "_")}.png`) });
      await page.keyboard.press("Escape");
      const gone = await status.count();
      console.log(`  #${i} left1=${a} | left2=${b} | end=${c} | home=${d} | afterEsc=${gone} | shift=${before.height - after.height}`);
    }
  }
  console.log("errors:", errors);
  await browser.close();
}
console.log(dir);
