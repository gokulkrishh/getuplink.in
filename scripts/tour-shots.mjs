// Takes the welcome tour's screenshots from a running demo copy, so the tour shows the real app.
// Usage: bun --install=force scripts/tour-shots.mjs [port]   (port 3210 by default, or UPLINK_VERIFY_PORT)
// Start the demo first: UPLINK_DEMO_SCENARIO= .claude/skills/verify/scripts/launch.sh 3223 (a plain demo: no dialog on top).
// Writes public/whats-new/tour/<step>-light.webp and -dark.webp, and lib/tour-targets.ts (where the part
// each step is about sits, as percentages of the picture). Run it again after any visible change to Home,
// the header, the Driving, Charging or Battery pages, Software, Compare or the account menu. It writes nothing outside the repo, and reads only the demo.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { headlessShell } from "../.claude/skills/verify/scripts/browser.mjs";

const PORT = Number(process.argv[2] ?? process.env.UPLINK_VERIFY_PORT ?? 3210);
const OUT = new URL("../public/whats-new/tour/", import.meta.url).pathname;
const TARGETS = new URL("../lib/tour-targets.ts", import.meta.url).pathname;
const W = 720;
const H = 1000;
const SCALE = 1.5;
const OUT_WIDTH = 960;

// Each step's page, what to do on it, and the part it is about (a box in page pixels).
const STEPS = [
  {
    name: "home",
    path: "/",
    box: (page) =>
      page.evaluate(() => {
        const has = (el, t) => el.textContent.includes(t);
        const cands = [...document.querySelectorAll("main *, body > * *")].filter((el) => has(el, "Driven") && has(el, "Spent") && !has(el, "Good afternoon") && el.getBoundingClientRect().width > 500);
        const el = cands.sort((a, b) => a.textContent.length - b.textContent.length)[0];
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
  },
  // The header's Driving, Charging and Battery links, as one box.
  {
    name: "stats",
    path: "/stats/driving",
    box: async (page) => {
      const [a, c] = await Promise.all([rect(page.locator('header a[href="/stats/driving"]').first(), 6), rect(page.locator('header a[href="/stats/battery"]').first(), 6)]);
      return { x: a.x, y: a.y, w: c.x + c.w - a.x, h: a.h };
    },
  },
  { name: "updates", path: "/updates", box: (page) => rect(page.locator('a[href="/updates"]').first(), 0) },
  { name: "compare", path: "/owners", box: (page) => rect(page.locator('a[href="/owners"]').first(), 0) },
  {
    name: "menu",
    path: "/",
    before: async (page) => {
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Release notes" }).waitFor();
      await page.waitForTimeout(400);
    },
    box: (page) => rect(page.getByRole("menuitem", { name: "Release notes" }), 0),
  },
];

async function rect(locator, pad) {
  const r = await locator.boundingBox();
  return { x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
}

const browser = await chromium.launch({ executablePath: headlessShell() });
const targets = {};
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ baseURL: `http://localhost:${PORT}`, viewport: { width: W, height: H }, deviceScaleFactor: SCALE, colorScheme: theme });
    // The app keeps the theme in this cookie (lib/theme.ts).
    await context.addCookies([{ name: "uplink-theme", value: theme, url: `http://localhost:${PORT}/` }]);
    const page = await context.newPage();
    for (const step of STEPS) {
      await page.goto(step.path, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      // Nothing of the dev tools or the feedback button in the picture.
      await page.addStyleTag({ content: "nextjs-portal,[data-feedback-button]{display:none!important}" });
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(W - 1, H - 1);
      await page.waitForTimeout(600);
      await step.before?.(page);
      if (theme === "light") {
        const b = await step.box(page);
        const pct = (n, of) => Math.round((n / of) * 10000) / 100;
        const box = { x: pct(b.x, W), y: pct(b.y, H), w: pct(b.w, W), h: pct(b.h, H) };
        // The pointer: a little way in from the left of the box, a bit below its middle.
        targets[step.name] = { ...box, at: { x: Math.round((box.x + Math.min(box.w * 0.6, 6.1)) * 100) / 100, y: Math.round((box.y + box.h * 0.6) * 100) / 100 } };
      }
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
      const webp = await sharp(png).resize({ width: OUT_WIDTH }).webp({ quality: 72 }).toBuffer();
      writeFileSync(join(OUT, `${step.name}-${theme}.webp`), webp);
      console.log(`${step.name}-${theme}.webp  ${Math.round(webp.length / 1024)} KB`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const body = Object.entries(targets)
  .map(([k, v]) => `  ${k}: { x: ${v.x}, y: ${v.y}, w: ${v.w}, h: ${v.h}, at: { x: ${v.at.x}, y: ${v.at.y} } },`)
  .join("\n");
writeFileSync(
  TARGETS,
  `// Generated by scripts/tour-shots.mjs: where the part each tour step is about sits in its screenshot, as
// percentages of the picture. Don't edit by hand; run \`bun --install=force scripts/tour-shots.mjs\` again.
export type TourSpot = "home" | "stats" | "updates" | "compare" | "menu";
export type Target = { x: number; y: number; w: number; h: number; at: { x: number; y: number } };

// The pictures, in public/whats-new/tour/<step>-light.webp and -dark.webp.
export const TOUR_SHOT = { width: ${OUT_WIDTH}, height: ${Math.round(H * (OUT_WIDTH / W))} } as const;

export const TOUR_TARGETS: Record<TourSpot, Target> = {
${body}
};
`,
);
console.log(`wrote ${TARGETS}`);
