// Headless Chromium for verification, from the browsers Playwright already cached on this Mac, so nothing
// downloads. Import it in a drive script run with `bun --install=force <script>` (Bun fetches
// playwright-core on first use; the repo itself doesn't depend on it).
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "Library/Caches/ms-playwright");

export function headlessShell() {
  const dirs = readdirSync(CACHE)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  if (dirs.length === 0) throw new Error(`No Chromium in ${CACHE}. Run: bunx playwright-core install chromium-headless-shell`);
  // The build's folder is named for the platform: mac-arm64 on the owner's Mac, linux64 in a cloud session.
  const build = readdirSync(join(CACHE, dirs[0])).find((d) => d.startsWith("chrome-headless-shell-"));
  return join(CACHE, dirs[0], build ?? "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
}

export const PORT = Number(process.env.UPLINK_VERIFY_PORT ?? 3210);
export const BASE = `http://localhost:${PORT}`;

// Where proof goes: survives cleanup.sh. One folder per run.
export function evidenceDir(run = new Date().toISOString().replace(/[:.]/g, "-")) {
  const dir = join(process.env.UPLINK_VERIFY_EVIDENCE ?? join(tmpdir(), "uplink-verify-evidence"), run);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// phone: an iPhone-sized touch viewport, for the phone layouts (max-sm in the code is under 640px).
export async function open({ phone = false, dark = false } = {}) {
  const browser = await chromium.launch({ executablePath: headlessShell() });
  const context = await browser.newContext({
    baseURL: BASE,
    colorScheme: dark ? "dark" : "light",
    ...(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { browser, page, errors };
}
