---
name: verify
description: Drive Uplink (getuplink.in, the Next.js Tesla companion web app) in a real browser to prove a UI change works, headless (Playwright scripts) or in the owner's own Chrome (Claude in Chrome). Starts an isolated demo-mode copy on port 3210, signed in with a sample car, then takes screenshots and page text as evidence. Use after changing pages, components or copy, or whenever a claim needs "I saw it work", not "it compiles".
---

# Verify Uplink

Uplink's surface is a web app (Next.js 16, App Router). The other surfaces (MCP connector at `/api/mcp`, cron routes, the Fly telemetry receiver) aren't covered here.

The verification instance is **demo mode** (`UPLINK_DEMO=1`): it signs in as a demo owner with one generated car (Model Y, "Demo car") and never touches Supabase or Tesla. It runs from a **copy** of the checkout, because Next.js allows one `next dev` per folder and the owner's own dev server usually holds the checkout on port 3000. Never stop, restart or drive the owner's server on 3000.

All paths below are from the repo root. Scripts live in `.claude/skills/verify/scripts/`.

## Launch

```bash
.claude/skills/verify/scripts/launch.sh          # port 3210; pass another port as $1 for a second instance
```

It copies tracked and untracked-but-not-ignored files (so your uncommitted edits come along; `.env*`, `keys/`, `.next` and `node_modules` don't) into `$TMPDIR/uplink-verify-<port>/app`, runs `bun install --frozen-lockfile` there, and starts `UPLINK_DEMO=1 bunx next dev -p <port>`. Ready when it prints `Ready: http://localhost:3210`. A relaunch after edits: `cleanup.sh 3210 --keep-copy` then `launch.sh 3210` (resyncs the files, keeps the installed modules).

The dev server compiles each route on first visit, so the first load of a page can take a few seconds.

## Doctor

```bash
.claude/skills/verify/scripts/doctor.sh          # read-only
```

Checks: the process launch.sh started is alive, it (not something else) serves the port, `GET /` is 200, and `/settings` is 200 (demo mode signed in; the real app redirects there). Run it first, and again whenever a page looks wrong. If it fails: `cleanup.sh`, then `launch.sh`.

## Drive

Playwright, through `scripts/browser.mjs`: it launches the headless Chromium already cached in `~/Library/Caches/ms-playwright` (no download), and Bun fetches `playwright-core` on first use. Always run drive scripts with `bun --install=force` (the repo doesn't depend on Playwright).

One page, screenshot plus visible text plus browser errors:

```bash
bun --install=force .claude/skills/verify/scripts/shot.mjs /stats/driving            # desktop 1280×900
bun --install=force .claude/skills/verify/scripts/shot.mjs /stats/driving --phone    # 390×844 touch, for max-sm layouts
bun --install=force .claude/skills/verify/scripts/shot.mjs /settings --dark --run my-check
```

A flow: write a script next to the others, modelled on `scripts/drive-driving.mjs`:

```js
import { join } from "node:path";
import { evidenceDir, open } from "./browser.mjs";
const dir = evidenceDir("my-check");
const { browser, page, errors } = await open({ phone: false, dark: false });
await page.goto("/stats/charging", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Month/ }).click();
// ...assert, screenshot to join(dir, "step.png"), print errors...
await browser.close();
```

Handles that hold in this app:
- Page tabs and header links: `getByRole("link", { name: "Charging" })`; the page links (scope to `getByRole("navigation", { name: "Main" })`, as pages repeat some names). From sm up that nav is in the header: `"Driving"`, `"Charging"`, `"Battery"`, `"Car"`. On a phone it is a pill of four icons floating at the bottom, `"Home"`, `"Driving"`, `"Charging"`, `"Battery"` (`[data-phone-nav]`, each link named by `aria-label`), rendered after the page content, and Car is a text link in the header row by the bell. It slides away while scrolling down, is back at the top, at the bottom and on scrolling up, and steps aside while a text field has focus. The account menu: `getByRole("button", { name: "Account menu" })`, holding Settings, Rollout (`getByRole("menuitem", { name: "Rollout" })`), Admin and Sign out.
- Period switch: buttons with `aria-pressed`, named `Day`, `Week`, `Month`, `Year`, `All`, `Custom`. Their accessible name repeats the label (`DayDay`), so match with `{ name: /^Week/ }`. Home and every Stats page (Driving, Charging, Battery) open on Week, Updates on Month (see `PAGE_PERIODS` in `components/stats/periods.ts`); any other period adds `?period=<value>`. A bar of a day, a month or a year is a link (`li.group > a`): hover, focus or a first tap shows its tip (`[data-bar-tip]`), which carries a link saying where it goes ("Open drive", "Open charge", "Open 28 Oct's drives", "Open October") (`[data-tip-link]`).
- Sections: `page.locator("section", { has: page.getByRole("heading", { name: "Trips" }) })`.
- Whole-row links (trips, legs, charges, sessions): the first `link` inside the row.
- ⓘ popovers: `getByRole("button", { name: "About <section title>" })`.

### Drive in the owner's Chrome (Claude in Chrome)

Use it when a check needs a real browser the owner can watch, or when the headless scripts can't show it: real fonts and scrolling, focus rings while tabbing, hover tips, a flow the owner wants to see done. Same demo copy, same Doctor; only the browser changes.

1. Load the `mcp__claude-in-chrome__*` tools in one ToolSearch (tabs_context_mcp, tabs_create_mcp, navigate, computer, find, read_page, get_page_text, read_console_messages, resize_window, tabs_close_mcp), then call `tabs_context_mcp` with `createIfEmpty: true`. Work only in that tab group's tabs; never touch the owner's other tabs.
2. Launch a copy and run Doctor as above. The owner's Chrome is signed in to the live app, so only ever open `http://localhost:<port>` here: demo mode needs no sign-in, and nothing on localhost reaches the owner's real data.
3. `navigate` to the route, then use `find` or `read_page` (filter `interactive`) for refs. The accessible names in the handles list above are the ones `find` matches ("Account menu", "Week", "About Trips"). Click by ref, not by coordinates, so it holds across window sizes.
4. Phone layout: `resize_window` to 390×844. Chrome's window can't go below its own minimum on some Macs, so read the page width back with `javascript_tool` (`innerWidth`) and say so if it stayed wider than 640, the `max-sm` break. Put the window back afterwards.
5. Keyboard: `computer` with `action: "key"` and `Tab`, `ArrowLeft`, `Escape`, then a `screenshot` to see the focus ring and tip.
6. Errors: `read_console_messages` with `pattern: "error|warn"` and `onlyErrors: true` after each page.
7. Evidence: `computer` `screenshot` with `save_to_disk: true` returns a file path; copy each file into the run's evidence folder (`mkdir -p $TMPDIR/uplink-verify-evidence/<run>`) so it survives the session, and save page text from `get_page_text` beside it. Name the folder in the report.
8. Close the tabs you created with `tabs_close_mcp`, then Cleanup.

Don't trigger browser `alert`/`confirm` dialogs: they freeze the extension until the owner dismisses them by hand. Uplink's own confirms are in-page, so they're safe. If the extension doesn't answer twice, stop and tell the owner rather than switching browsers silently.

## Evidence

Each run writes to `$TMPDIR/uplink-verify-evidence/<run>/` (`UPLINK_VERIFY_EVIDENCE` overrides the root): PNG screenshots and `.txt` page text. Cleanup never touches it. Name the folder in your report.

Proof standards:
- Drive the path a user takes: click the switch, follow the link. Don't call server actions or set state directly.
- Capture the action and the state after it (URL, `aria-pressed`, the new heading), not only the final screen.
- Check both layouts when the change touches `max-sm:` classes: run once plain and once with `--phone`.
- Read the `errors` line: React warnings and page errors count as findings.
- Demo data is generated, not the owner's. A change that only shows with real data (Supabase rows, Tesla answers) can't be proven here; say so instead of claiming it.
- Settings actions that write (Create token, Delete my data, Sign out everywhere) run against demo mode, which has no database. Read the action's demo branch before treating its result as proof.

Look like a designer before calling it done. "It renders" and "0 FAIL" aren't enough:
- Open every screenshot you took: phone and desktop, light and dark.
- Alignment: a leading icon's centre matches the first text line's centre within 2px. Measure it with `boundingBox`.
- Spacing: related controls (thumbs, arrows, a button and its text) sit close together. Measure the visible gap, not just the box.
- Placement: on phones the action sits under the text, aligned left, where reading ends. Nothing should float alone on the right.
- Reuse: before building a style (glow, link, button, card), search `app/globals.css` and `components/ui` for one that exists, and match the nearest similar component.
- An agent's "done" includes its screenshots. Open them yourself before passing anything on to the owner.

## Beyond one change

- **Try to break it**: the `launch-qa` skill (`.claude/skills/launch-qa/`), five first-time owners (impatient, skeptic, mobile on slow 3G, literal reader, breaker) as subagents, before and after a fix.
- **Scenarios**: the home page takes `?scenario=` (`DEMO_SCENARIOS` in `lib/demo.ts`: parked, charging, updating, installing, firstWeek); `/setup?step=done` shows setup finished. The alerts bell shows a fixed sample in demo (`demoAlerts` in `lib/server/alerts.ts`): one "Needs you" row (access running out) and one "Good to know" row (service centre). Not reachable in demo yet: the waitlist after sign-in, a valid invite, a removed key, the bell's empty state, a "since" time on a row. Say so rather than claim them.
- **Before/after**: `scripts/before-after.mjs <before port> <after port> <route>...` shoots the same pages from two demo copies, desktop and 375px phone.
- **Launch checklist**: `scripts/launch-checklist.mjs` checks the first-time path on desktop and phone (copy, overflow, offline handling, 404s, page errors) and prints PASS/FAIL. Run it yourself, phone layout included, instead of handing the owner a checklist.

## Cleanup

```bash
.claude/skills/verify/scripts/cleanup.sh         # stops only the process tree launch.sh started, removes the copy
.claude/skills/verify/scripts/cleanup.sh 3210 --keep-copy   # keep the copy for a faster relaunch
```

It kills by the PID launch.sh recorded, never by process name, and leaves `$TMPDIR/uplink-verify-evidence/` alone.

## Feature map

`features/README.md` lists the user-facing features and how to prove each. A proof covers every entry point the map lists for that feature. Keep the map current with `/maintain-verification-skill`.
