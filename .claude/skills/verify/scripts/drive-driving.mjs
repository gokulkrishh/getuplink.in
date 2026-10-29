// Proof run for features/stats-driving.md: Stats > Driving opens on Week, the switch moves to Month (and the
// URL says so), and a trip row opens that trip's page. Screenshots of each step go to the evidence folder.
// Usage: bun --install=force .claude/skills/verify/scripts/drive-driving.mjs [--phone]
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const phone = process.argv.includes("--phone");
const dir = evidenceDir(`driving${phone ? "-phone" : ""}`);
const { browser, page, errors } = await open({ phone });
const pressed = (name) => page.getByRole("button", { name: new RegExp(`^${name}`) }).getAttribute("aria-pressed");
// The switch runs in a transition: wait for the network to settle before reading the new state.
const settle = async () => {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
};
try {
  await page.goto("/stats/driving", { waitUntil: "networkidle" });
  console.log(`default  Week pressed=${await pressed("Week")}  ${page.url()}`);
  await page.screenshot({ path: join(dir, "1-default.png"), fullPage: true });

  await page.getByRole("button", { name: /^Month/ }).click();
  await page.waitForURL(/period=month/);
  await settle();
  console.log(`month    Month pressed=${await pressed("Month")}  ${page.url()}`);
  await page.screenshot({ path: join(dir, "2-month.png"), fullPage: true });

  const trips = page.locator("section", { has: page.getByRole("heading", { name: "Trips" }) });
  const row = trips.getByRole("link").first();
  const label = (await row.innerText()).trim();
  await row.click();
  await page.waitForURL(/\/stats\/driving\/\d+/);
  await settle();
  console.log(`trip     "${label}" -> ${page.url()}  h1=${await page.locator("h1").first().innerText()}`);
  await page.screenshot({ path: join(dir, "3-trip.png"), fullPage: true });

  console.log(`errors   ${errors.length ? errors.map((e) => e.split("\n")[0].slice(0, 160)).join(" || ") : "none"}`);
  console.log(`evidence ${dir}`);
} finally {
  await browser.close();
}
