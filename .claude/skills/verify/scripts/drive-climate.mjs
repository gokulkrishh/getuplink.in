// The drive page's Climate chart (desktop and phone, with a hover/tap tooltip) and Stats > Driving's
// Efficiency "AC setting" table.
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const dir = evidenceDir("climate");

for (const phone of [false, true]) {
  const { browser, page, errors } = await open({ phone });
  const tag = phone ? "phone" : "desktop";
  await page.goto("/stats/driving", { waitUntil: "networkidle" });
  const hrefs = await page.locator('a[href^="/stats/driving/1"]').evaluateAll((els) => els.slice(0, 12).map((e) => e.getAttribute("href")));
  let shown = false;
  for (const href of hrefs) {
    await page.goto(href, { waitUntil: "networkidle" });
    const card = page.locator("section", { has: page.getByRole("heading", { name: "Climate" }) }).last();
    if ((await card.count()) === 0) {
      console.log(`${tag} ${href}: no Climate chart`);
      continue;
    }
    if (!(await card.locator("ul").innerText()).includes("Set temperature")) continue;
    shown = true;
    await card.scrollIntoViewIfNeeded();
    console.log(`${tag} ${href}: ${(await card.locator("p").first().innerText()).trim()}`);
    console.log(`${tag} legend: ${(await card.locator("ul").innerText()).replace(/\n/g, " | ")}`);
    const plot = card.locator('[role="img"]');
    const box = await plot.boundingBox();
    for (const [name, frac] of [["a", 0.3], ["b", 0.8]]) {
      if (phone) await page.touchscreen.tap(box.x + box.width * frac, box.y + box.height / 2);
      else await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2);
      await page.waitForTimeout(200);
      console.log(`${tag} tooltip ${name}: ${(await card.locator('[aria-live="polite"]').innerText()).replace(/\n/g, " | ")}`);
      await card.screenshot({ path: join(dir, `climate-${tag}-${name}.png`) });
    }
    break;
  }
  if (!shown) console.log(`${tag}: no drive among the first ${hrefs.length} has a Climate chart`);
  await page.goto("/stats/driving", { waitUntil: "networkidle" });
  const eff = page.locator("section", { has: page.getByRole("heading", { name: "Efficiency" }) }).first();
  if ((await eff.count()) > 0) {
    await eff.scrollIntoViewIfNeeded();
    console.log(`${tag} efficiency tables: ${(await eff.locator("th[scope=col]").allInnerTexts()).filter((t) => ["Outside", "Average speed", "AC setting"].includes(t.trim())).join(", ")}`);
    console.log(`${tag} AC rows: ${(await eff.locator("table").nth(2).locator("tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" ; ")}`);
    await eff.screenshot({ path: join(dir, `efficiency-${tag}.png`) });
  } else console.log(`${tag}: no Efficiency card`);
  console.log(`${tag} errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await browser.close();
}
console.log("evidence:", dir);
