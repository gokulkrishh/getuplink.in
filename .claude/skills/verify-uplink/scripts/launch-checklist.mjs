// The launch checklist: every first-time-owner fix from the Oct 2026 persona run, checked on desktop and on a
// 375px phone in one go. Prints PASS/FAIL per line; screenshots go to the evidence folder "launch-checklist".
// Run: bun --install=force .claude/skills/verify-uplink/scripts/launch-checklist.mjs
import { join } from "node:path";
import { chromium } from "playwright-core";
import { BASE, evidenceDir, headlessShell } from "./browser.mjs";
const dir = evidenceDir("launch-checklist");
const results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await chromium.launch({ executablePath: headlessShell() });

async function ctx(phone) {
  const c = await browser.newContext({ baseURL: BASE, ...(phone ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }) });
  const p = await c.newPage(); const errors = [];
  p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { c, p, errors };
}
const text = (p) => p.evaluate(() => document.body.innerText);
const sw = (p) => p.evaluate(() => document.documentElement.scrollWidth);

for (const phone of [false, true]) {
  const tag = phone ? "phone" : "desktop";
  const { c, p, errors } = await ctx(phone);
  const go = async (u) => { await p.goto(u, { waitUntil: "networkidle" }); await p.screenshot({ path: join(dir, `${tag}${u.replace(/[^a-z0-9]+/gi, "_")}.png`), fullPage: true }); return text(p); };

  let t = await go("/home");
  check(`${tag} /home free for now`, t.includes("Free for now. This may change."));
  check(`${tag} /home demo caption`, t.includes("Opens a sample car on a separate site."));
  check(`${tag} /home invite line`, t.includes("No invite yet? Email getuplink.app@gmail.com"));
  check(`${tag} /home Tesla permissions warning`, /asks for your car's location and charging access/.test(t));
  check(`${tag} /home no raw tool names`, !/get_charging_summary|attach_charge_invoice/.test(t));
  check(`${tag} /home no Fleet API`, !t.includes("Fleet API"));
  check(`${tag} /home Contact link`, (await p.getByRole("link", { name: "Contact" }).count()) > 0);
  check(`${tag} /home Sign in is a button-styled link`, await p.getByRole("link", { name: "Sign in", exact: true }).first().evaluate((e) => getComputedStyle(e).borderTopWidth !== "0px"));
  if (phone) check(`phone /home no sideways scroll`, (await sw(p)) <= 375, `scrollWidth ${await sw(p)}`);

  t = await go("/waitlist");
  check(`${tag} /waitlist sign-in button`, (await p.getByRole("link", { name: "Sign in to check again" }).count()) === 1);
  check(`${tag} /waitlist leave/ask email`, t.includes("leave the waitlist"));
  if (phone) check(`phone /waitlist no sideways scroll`, (await sw(p)) <= 375);

  t = await go("/invite/abc");
  check(`${tag} /invite bad link email`, t.includes("email us for a new one") && (await p.getByRole("link", { name: /Email getuplink/ }).count()) > 0);

  t = await go("/setup");
  check(`${tag} /setup key explained`, t.includes("It can't unlock or drive the car."));
  check(`${tag} /setup header is logo + account menu only`, (await p.getByRole("navigation", { name: "Main" }).getByRole("link").count()) === 0 && (await p.getByRole("button", { name: /^Alerts/ }).count()) === 0 && (await p.getByRole("button", { name: "Account menu" }).count()) === 1);
  check(`${tag} /setup button reads Connect your car`, (await p.getByRole("link", { name: "Connect your car" }).count()) === 1);
  check(`${tag} /setup guide captions`, ["Scan the QR code with your phone", "Tap Approve", "Come back and tap Check again"].every((c) => t.includes(c)));
  const imgs = p.locator("ol img");
  check(`${tag} /setup 3 guide photos load`, (await imgs.count()) === 3 && (await imgs.evaluateAll((els) => els.every((e) => e.complete && e.naturalWidth > 0))));
  check(`${tag} /setup live-data line once`, t.split("Live data includes where your car goes").length === 2);
  if (phone) {
    check(`phone /setup no sideways scroll`, (await sw(p)) <= 375, `scrollWidth ${await sw(p)}`);
    const row = p.locator("ol.snap-x");
    check(`phone /setup photos swipe in their own row`, await row.evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === "auto"));
  }
  await p.getByRole("button", { name: "Check again" }).click();
  await p.getByText("No change yet. Try again in a few minutes.").waitFor({ timeout: 15000 }).then(() => check(`${tag} /setup Check again feedback`, true), () => check(`${tag} /setup Check again feedback`, false));

  t = await go("/setup?step=done");
  check(`${tag} /setup done copy`, t.includes("Your car is set up") && t.includes("Go to your dashboard"));
  check(`${tag} /setup done: no Connect button, ticks shown`, (await p.getByRole("link", { name: "Connect your car" }).count()) === 0 && t.includes("Live"));

  t = await go("/");
  check(`${tag} / About km (no ≈)`, t.includes("About ") && !t.includes("≈"));
  const bell = p.getByRole("button", { name: /^Alerts/ });
  // Demo's bell carries sample alerts (one "Needs you"), so it's full strength with a dot.
  check(`${tag} / bell says what needs you`, /needs you/i.test((await bell.getAttribute("aria-label")) ?? ""));
  await (phone ? bell.tap() : bell.click());
  await p.getByText("Needs you", { exact: true }).waitFor({ timeout: 8000 }).then(() => check(`${tag} / bell opens`, true), () => check(`${tag} / bell opens`, false));
  await p.keyboard.press("Escape");
  if (phone) {
    check(`phone / no floating feedback button`, !(await p.locator("[data-feedback-button]").isVisible()));
    await p.getByRole("button", { name: "Account menu" }).tap();
    await p.getByRole("menuitem", { name: "Send feedback" }).waitFor({ timeout: 5000 }).then(() => check(`phone / Send feedback in the account menu`, true), () => check(`phone / Send feedback in the account menu`, false));
    await p.keyboard.press("Escape");
    check(`phone / no sideways scroll`, (await sw(p)) <= 375);
  }

  t = await go("/stats/driving");
  check(`${tag} /stats/driving no "regen"`, !/regen/i.test(t) && t.includes("won back while slowing"));
  const tripHref = await p.locator("a[href^='/stats/driving/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")).find((h) => /\/stats\/driving\/\d{12}/.test(h)));
  t = await go(tripHref);
  check(`${tag} trip page no "regen"`, !/regen/i.test(t));
  await go("/stats/charging");

  t = await go("/settings");
  check(`${tag} /settings button labels`, ["Disconnect Tesla", "Delete my data", "Delete account"].every((n) => t.includes(n)));
  check(`${tag} /settings Tesla row note`, t.includes("Disconnecting stops Uplink reading your car. Your history stays."));
  check(`${tag} /settings home state line`, t.includes("Only the state is kept here.") && !t.includes("never where your car is"));
  await c.setOffline(true);
  await p.getByRole("button", { name: "Sign out everywhere" }).first().click();
  const confirmBtn = p.getByRole("button", { name: "Sign out everywhere" }).last(); if (await confirmBtn.isVisible()) await confirmBtn.click().catch(() => {});
  await p.getByText("Couldn't reach Uplink. Check your connection and try again.").first().waitFor({ timeout: 8000 }).then(() => check(`${tag} /settings offline shows inline line`, true), () => check(`${tag} /settings offline shows inline line`, false));
  check(`${tag} /settings offline stays on page`, !(await text(p)).includes("Couldn't load this page"));
  await p.screenshot({ path: join(dir, `${tag}_settings_offline.png`) });
  await c.setOffline(false);

  await go("/privacy");
  // The full text sits in closed folds, which innerText skips: open them all first.
  t = await p.evaluate(() => { document.querySelectorAll("details").forEach((d) => { d.open = true; }); return document.body.innerText; });
  check(`${tag} /privacy In short + archive + date`, t.includes("In short") && t.includes("Each finished drive is also saved for good") && t.includes("29 October 2026") && t.includes("speed, location, cabin temperature and battery range for 120 days"));

  const r = await p.goto("/stats/driving/notadate");
  check(`${tag} bad trip is a 404`, r.status() === 404 && (await text(p)).includes("Page not found"));

  const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|404|net::ERR/.test(e));
  check(`${tag} no page errors`, real.length === 0, real.slice(0, 3).join(" | "));
  await c.close();
}
await browser.close();
console.log(results.join("\n")); console.log("evidence:", dir);
