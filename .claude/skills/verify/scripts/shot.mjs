// Open one page of the verification instance, save a full-page screenshot and its visible text, and print
// the page's headings and any browser errors.
// Usage: bun --install=force shot.mjs <path> [--phone] [--dark] [--run <name>]
//   e.g. bun --install=force .claude/skills/verify/scripts/shot.mjs /stats/driving --phone
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const args = process.argv.slice(2);
const path = args.find((a) => a.startsWith("/")) ?? "/";
const phone = args.includes("--phone");
const dark = args.includes("--dark");
const run = args.includes("--run") ? args[args.indexOf("--run") + 1] : undefined;

const dir = evidenceDir(run);
const name = `${path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}${phone ? "-phone" : ""}${dark ? "-dark" : ""}`;
const { browser, page, errors } = await open({ phone, dark });
try {
  const response = await page.goto(path, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  const text = await page.locator("main, body").first().innerText();
  writeFileSync(join(dir, `${name}.txt`), text);
  const headings = await page.locator("h1, h2").allInnerTexts();
  console.log(`status  ${response?.status()}  ${page.url()}`);
  console.log(`title   ${await page.title()}`);
  console.log(`heads   ${headings.map((h) => h.trim()).filter(Boolean).join(" | ")}`);
  console.log(`errors  ${errors.length ? errors.map((e) => e.split("\n")[0].slice(0, 160)).join(" || ") : "none"}`);
  console.log(`saved   ${join(dir, name)}.png and .txt`);
} finally {
  await browser.close();
}
