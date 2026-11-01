// The launch checklist: every first-time-owner fix from the Oct 2026 persona run, checked on desktop and on a
// 375px phone in one go. Prints PASS/FAIL per line; screenshots go to the evidence folder "launch-checklist".
// Run: bun --install=force .claude/skills/verify/scripts/launch-checklist.mjs
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
  const openHabits = async () => {
    const fold = p.locator("[data-slot=collapsible-trigger]", { hasText: "Your charging habits" });
    if ((await fold.getAttribute("aria-expanded")) !== "true") await (phone ? fold.tap() : fold.click());
    await p.locator("table:has(th:text-is('Charger'))").waitFor({ state: "visible" });
  };
  const go = async (u) => { await p.goto(u, { waitUntil: "networkidle" }); await p.screenshot({ path: join(dir, `${tag}${u.replace(/[^a-z0-9]+/gi, "_")}.png`), fullPage: true }); return text(p); };

  let t = await go("/home");
  check(`${tag} /home free for now`, t.includes("Free for now. This may change."));
  check(`${tag} /home demo caption`, t.includes("Opens a sample car on a separate site."));
  // Invites go out by message only (29 Oct 2026): the home page no longer asks people to email for one.
  check(`${tag} /home has no ask-for-invite line`, !t.includes("No invite yet?"));
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
  check(`${tag} /invite bad link says who to ask`, t.includes("ask the person who invited you for a new one"));

  t = await go("/setup");
  check(`${tag} /setup title once`, (await p.title()) === "Setup · Uplink", await p.title());
  check(`${tag} /setup Approve says where`, t.includes("Tap Approve in the Tesla app"));
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
  t = await go("/stats/charging");
  // Launch QA 29 Oct 2026: the DC sessions read in full on a phone. The table scrolls sideways there and the
  // charger's name wraps in its cell rather than being cut. The DC table sits in the closed "Your charging
  // habits" fold, where nothing has a size: open it first.
  if (phone) {
    await openHabits();
    check(`phone /stats/charging no sideways scroll`, (await sw(p)) <= 375, `scrollWidth ${await sw(p)}`);
    const names = p.locator("table:has(th:text-is('Charger')) tbody td:nth-child(3)");
    check(`phone /stats/charging charger names not cut`, (await names.count()) > 0 && (await names.evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1))));
    // The charges' place names wrap in the scrolling table on a phone, never cut.
    const places = p.locator(".overflow-x-auto li p.font-medium > span");
    check(`phone /stats/charging charge place names not cut`, (await places.count()) > 0 && (await places.evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1))));
  }
  t = await go("/stats/driving?period=custom&from=2030-01-01&to=2030-02-01");
  check(`${tag} custom future dates name what's shown`, t.includes("Uplink couldn't use those dates, so it shows") && !t.includes("Pick dates up to today."));
  t = await go("/stats/battery");
  check(`${tag} /stats/battery says Awake, not Online`, t.includes("Awake") && !/\bOnline\b/.test(t));
  t = await go("/updates");
  // The India rollout is a section of Software now, with Adoption over time closed (31 Oct 2026); old /rollout
  // links land on it, and the account menu no longer lists it.
  const tab = (await p.locator('a[href="/updates"]').first().innerText().catch(() => "")).trim();
  check(`${tag} /updates Software tab and India rollout`, tab === "Software" && t.includes("India rollout") && t.includes("Newest in India"), `tab "${tab}"`);
  check(`${tag} /updates Adoption over time starts closed`, (await p.locator("[data-slot=collapsible-trigger]", { hasText: "Adoption over time" }).getAttribute("aria-expanded")) === "false");
  await p.goto("/rollout", { waitUntil: "networkidle" });
  check(`${tag} /rollout lands on /updates#rollout`, new URL(p.url()).pathname === "/updates" && new URL(p.url()).hash === "#rollout", p.url());
  await (phone ? p.getByRole("button", { name: "Account menu" }).tap() : p.getByRole("button", { name: "Account menu" }).click());
  await p.getByRole("menuitem", { name: "Settings" }).waitFor();
  check(`${tag} account menu has no Rollout`, (await p.getByRole("menuitem", { name: /rollout/i }).count()) === 0);
  await p.keyboard.press("Escape");
  t = await go("/owners");
  check(`${tag} /owners says Period, not Covers`, t.includes("Period") && !/\bCovers\b/.test(t));

  t = await go("/settings");
  if (phone) {
    const hits = await p.locator("main ~ footer a, footer a").evaluateAll((as) => as.filter((a) => /Privacy|Terms|Status/.test(a.textContent)).map((a) => Math.round(a.getBoundingClientRect().height)));
    check(`phone /settings footer links 24px or taller`, hits.length >= 3 && hits.every((h) => h >= 24), hits.join(","));
  }
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

  // Data tables fit the page column on desktop, no sideways scroll; on a phone they keep every column and
  // scroll in their box (PR #69), with a trip's distance in view before scrolling (Distance sits after When).
  const boxes = () => p.locator("main table").evaluateAll((ts) => ts.map((t) => { let s = t.parentElement; while (s && getComputedStyle(s).overflowX === "visible") s = s.parentElement; return { head: t.querySelector("thead")?.textContent ?? "", scrolls: !!s && s.scrollWidth > s.clientWidth + 1, box: s?.getBoundingClientRect().right ?? 0, cells: [...(t.querySelector("tbody tr")?.children ?? [])].map((c) => c.getBoundingClientRect().right) }; }));
  for (const u of ["/stats/driving", "/stats/battery", "/stats/charging", "/updates"]) {
    await go(u);
    if (u === "/stats/charging") await openHabits();
    const tables = await boxes();
    if (!phone) check(`desktop ${u} tables fit without sideways scroll`, tables.every((b) => !b.scrolls), tables.filter((b) => b.scrolls).map((b) => b.head.slice(0, 30)).join(" | "));
    if (phone && u === "/stats/driving") {
      const trips = tables.find((b) => b.head.startsWith("#WhenDistance"));
      check(`phone /stats/driving trips scroll sideways, distance in view`, !!trips && trips.scrolls && trips.cells[2] <= trips.box + 1, trips ? `distance ends ${Math.round(trips.cells[2])}, box ${Math.round(trips.box)}` : "no trips table");
    }
  }

  // Header Sign out while offline stays on the page with the usual line (Launch QA 29 Oct 2026).
  await go("/stats/battery");
  // Where the car was parked wraps in the scrolling table on a phone, never cut.
  if (phone) {
    const spots = p.locator(".overflow-x-auto td span.min-w-0");
    check(`phone /stats/battery parked place names not cut`, (await spots.count()) > 0 && (await spots.evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1))));
  }
  await c.setOffline(true);
  await (phone ? p.getByRole("button", { name: "Account menu" }).tap() : p.getByRole("button", { name: "Account menu" }).click());
  await p.getByRole("menuitem", { name: "Sign out" }).click().catch(() => {});
  await p.getByText("Couldn't reach Uplink. Check your connection and try again.").first().waitFor({ timeout: 8000 }).then(() => check(`${tag} offline Sign out shows inline line`, true), () => check(`${tag} offline Sign out shows inline line`, false));
  check(`${tag} offline Sign out stays on page`, !(await text(p)).includes("Couldn't load this page"));
  await c.setOffline(false);

  await go("/privacy");
  t = await text(p);
  check(`${tag} /privacy services + date`, t.includes("How we use your data") && t.includes("30 October 2026"));

  const r = await p.goto("/stats/driving/notadate");
  check(`${tag} bad trip is a 404`, r.status() === 404 && (await text(p)).includes("Page not found"));

  const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|404|net::ERR/.test(e));
  check(`${tag} no page errors`, real.length === 0, real.slice(0, 3).join(" | "));
  await c.close();
}

// No layout shift (AGENTS.md "Before merging"). Part 1: a button that works keeps its size, and so does the
// card around it. Server actions are held for 1.5 s, then dropped, so nothing is written. Part 2: the
// cumulative layout shift on first load of the main pages stays at or under 0.1.
const HOLD_MS = 1500;
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; });
const same = (a, b) => Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
async function holdActions(p) {
  await p.route("**/*", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && (await r.allHeaders())["next-action"]) { await new Promise((ok) => setTimeout(ok, HOLD_MS)); return route.abort().catch(() => {}); }
    return route.continue();
  });
}
async function steady(name, p, button, card, press) {
  if (!(await button.count())) { check(name, false, "button not found"); return; }
  const [b0, c0] = [await box(button), await box(card)];
  await press();
  await p.waitForTimeout(500);
  const [b1, c1] = [await box(button), await box(card)];
  const busy = (await button.isDisabled().catch(() => false)) || (await button.getAttribute("aria-busy")) === "true";
  check(name, busy && same(b0, b1) && same(c0, c1), `${busy ? "" : "never went pending; "}button ${b0.w}x${b0.h} to ${b1.w}x${b1.h}, card ${c0.w}x${c0.h} to ${c1.w}x${c1.h}`);
}
for (const phone of [false, true]) {
  const tag = phone ? "phone" : "desktop";
  const { c, p } = await ctx(phone);
  await holdActions(p);
  const tap = (loc) => (phone ? loc.tap() : loc.click());

  await p.goto("/", { waitUntil: "networkidle" });
  const share = p.getByRole("region", { name: "Compare with other owners" });
  if (await share.count()) await steady(`${tag} / Share keeps its size`, p, share.getByRole("button", { name: "Share" }), share, () => tap(share.getByRole("button", { name: "Share" })));
  else console.log(`SKIP  ${tag} / Share card is not shown in this demo`);

  await p.goto("/setup", { waitUntil: "networkidle" });
  const again = p.getByRole("button", { name: "Check again" });
  await steady(`${tag} /setup Check again keeps its size`, p, again, again.locator("xpath=ancestor::*[self::section or self::div][1]"), () => tap(again));

  await p.goto("/settings", { waitUntil: "networkidle" });
  await p.locator("[data-slot=collapsible-trigger]", { hasText: "Connect your AI" }).click();
  const add = p.locator("button:visible", { hasText: "Add connector" }).first();
  await p.locator('input[aria-label="Connector name"]:visible').first().fill("Layout test");
  await steady(`${tag} /settings Add connector keeps its size`, p, add, add.locator("xpath=ancestor::form[1]"), () => tap(add));
  await c.close();
}
// Pages are loaded in a fresh context each, with the observer in place before any of the page's own script.
for (const phone of [false, true]) {
  const tag = phone ? "phone" : "desktop";
  for (const u of ["/", "/stats/driving", "/stats/charging", "/owners", "/settings", "/car", "/updates"]) {
    const { c, p } = await ctx(phone);
    await p.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await p.goto(u, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const cls = await p.evaluate(() => window.__cls);
    check(`${tag} ${u} layout shift at most 0.1`, cls <= 0.1, `CLS ${cls.toFixed(3)}`);
    await c.close();
  }
}
await browser.close();
console.log(results.join("\n")); console.log("evidence:", dir);
