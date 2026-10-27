// The AI tips box on Home, a drive, Stats > Charging, a charge and Stats > Battery, desktop and phone: it
// shows, its votes work, and it is the size of its loading skeleton (no layout shift when it arrives).
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";

const dir = evidenceDir("tips");
const SKELETON =
  '<div class="space-y-2 border px-4 py-3" data-probe="1"><div class="flex h-6 items-center"><div class="h-3 w-16 animate-pulse bg-muted"></div></div><div class="min-h-25 space-y-2 pt-1 sm:min-h-15"><div class="h-3 w-full animate-pulse bg-muted"></div><div class="h-3 w-2/3 animate-pulse bg-muted"></div></div></div>';

for (const phone of [false, true]) {
  const { browser, page, errors } = await open({ phone });
  const tag = phone ? "phone" : "desktop";
  // The latest drive and a charge with a tip, from the lists.
  await page.goto("/stats/driving", { waitUntil: "networkidle" });
  const drive = await page.locator('a[href^="/stats/driving/1"]').first().getAttribute("href");
  const pages = [
    ["home", "/"],
    ["drive", drive],
    ["charging", "/stats/charging"],
    ["charge", "/stats/charging/99"],
    ["battery", "/stats/battery"],
  ];
  for (const [name, path] of pages) {
    await page.goto(path, { waitUntil: "networkidle" });
    const box = page.locator('section[aria-label="Tips"]');
    const shown = (await box.count()) > 0;
    let line = `${tag} ${name} ${path}: tips ${shown ? "shown" : "absent"}`;
    if (shown) {
      await box.scrollIntoViewIfNeeded();
      const count = await box.getByRole("button", { name: /^Next/ }).count();
      const tipText = await box.locator("p").innerText();
      // The skeleton's markup beside the box, at the same width: their heights must match.
      const heights = await box.evaluate((el, html) => {
        el.insertAdjacentHTML("afterend", html);
        const probe = el.nextElementSibling;
        const out = { box: el.getBoundingClientRect().height, skeleton: probe.getBoundingClientRect().height, text: el.querySelector("p").getBoundingClientRect().height };
        probe.remove();
        return out;
      }, SKELETON);
      await page.screenshot({ path: join(dir, `${name}-${tag}.png`), fullPage: false });
      await box.screenshot({ path: join(dir, `${name}-${tag}-box.png`) });
      // Vote: the chosen thumb stays lit, and it can be changed.
      const up = box.getByRole("button", { name: "Useful", exact: true });
      const down = box.getByRole("button", { name: "Not useful" });
      await up.click();
      const upPressed = await up.getAttribute("aria-pressed");
      await down.click();
      const changed = [await up.getAttribute("aria-pressed"), await down.getAttribute("aria-pressed")];
      if (name === "home") await box.screenshot({ path: join(dir, `${name}-${tag}-voted.png`) });
      line += ` · next:${count} · height ${heights.box} vs skeleton ${heights.skeleton} (text ${heights.text}) · vote up pressed=${upPressed}, after down: up=${changed[0]} down=${changed[1]} · "${tipText}"`;
    }
    // The drive's one-line AI summary keeps its own two-line height; only the tips hold more.
    const summary = page.locator('section[aria-label="Summary"] p');
    if ((await summary.count()) > 0) line += ` · summary text height ${(await summary.boundingBox()).height}`;
    console.log(line);
  }
  await page.goto("/admin/feedback", { waitUntil: "networkidle" });
  await page.screenshot({ path: join(dir, `admin-feedback-${tag}.png`), fullPage: true });
  console.log(`${tag} admin: ${(await page.getByRole("heading", { name: "Tips" }).count()) > 0 ? "Tips section shown" : "no Tips section"} (${page.url()})`);
  console.log(`${tag} errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await browser.close();
}
console.log(`evidence: ${dir}`);
