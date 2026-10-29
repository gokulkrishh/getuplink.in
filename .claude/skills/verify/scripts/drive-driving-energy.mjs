// Proof run for features/stats-driving.md: the Distance chart carries the period's energy. Week, then its
// tallest bar's tip (hover, or a tap on a phone), then Year, where Efficiency by season and Time at each
// speed join the page. Prints the sections, the energy line and the tip, and saves screenshots.
// Usage: bun --install=force .claude/skills/verify/scripts/drive-driving-energy.mjs [--phone] [--run <name>]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const args = process.argv.slice(2);
const phone = args.includes("--phone");
const run = args.includes("--run") ? args[args.indexOf("--run") + 1] : `driving-energy${phone ? "-phone" : ""}`;
const sfx = phone ? "-phone" : "";
const dir = evidenceDir(run);
const { browser, page, errors } = await open({ phone });
const settle = async () => {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
};
const sections = async () => (await page.locator("main h2").allInnerTexts()).map((h) => h.trim()).filter(Boolean);
const shot = async (name) => {
  await page.screenshot({ path: join(dir, `${name}${sfx}.png`), fullPage: true });
  writeFileSync(join(dir, `${name}${sfx}.txt`), await page.locator("main, body").first().innerText());
};
const distance = page.locator("section", { has: page.getByRole("heading", { name: "Distance" }) });
try {
  await page.goto("/stats/driving", { waitUntil: "networkidle" });
  await settle();
  const week = await sections();
  console.log(`week     ${week.length} sections: ${week.join(" | ")}`);
  console.log(`headline ${(await distance.locator("figcaption").first().innerText()).trim()}`);
  await shot("1-week");

  // The tallest bar: the column whose sr-only words carry the biggest km figure.
  const columns = distance.locator("li.group");
  let best = 0;
  let bestKm = -1;
  for (let i = 0; i < (await columns.count()); i++) {
    const km = Number.parseFloat((await columns.nth(i).innerText()).match(/([\d.]+)\s*km/)?.[1] ?? "0");
    if (km > bestKm) [best, bestKm] = [i, km];
  }
  const col = columns.nth(best);
  if (phone) await col.tap();
  else await col.hover();
  await page.waitForTimeout(400);
  const tip = col.locator("[data-bar-tip]");
  console.log(`tip      ${(await tip.innerText()).replace(/\n/g, " / ")}`);
  console.log(`tip link ${(await tip.locator("[data-tip-link]").count()) ? await tip.locator("[data-tip-link]").getAttribute("href") : "none"}`);
  await distance.screenshot({ path: join(dir, `2-week-tip${sfx}.png`) });

  await page.getByRole("button", { name: /^Year/ }).click();
  await page.waitForURL(/period=year/);
  await settle();
  const year = await sections();
  console.log(`year     ${year.length} sections: ${year.join(" | ")}`);
  console.log(`headline ${(await distance.locator("figcaption").first().innerText()).trim()}`);
  await shot("3-year");

  console.log(`errors   ${errors.length ? errors.map((e) => e.split("\n")[0].slice(0, 160)).join(" || ") : "none"}`);
  console.log(`evidence ${dir}`);
} finally {
  await browser.close();
}
