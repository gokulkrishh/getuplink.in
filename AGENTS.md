<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Fix it everywhere

When asked to fix something (a bug, a layout problem, a copy or style issue), check the whole app for the same issue and fix every instance, not just the one reported. Say in the summary where else it was found and fixed.

## Writing copy

Every word a user sees (labels, descriptions, ⓘ notes, captions, empty states, errors, buttons, Settings, Admin, the home page) follows these rules. Check any string you add or change against them. Before adding, changing or reviewing any user-facing string, load the `uplink-copy` skill (`.claude/skills/uplink-copy/SKILL.md`): it holds the word list, house style and patterns.

- **Written for car owners, not developers.** Most readers own a Tesla and have never seen code. Use everyday words; no technical terms like median, g, telemetry, API, stream or readings. This matters most in ⓘ tooltips: one or two short sentences that answer "what does this mean for me?".
- **Human and plain.** Write the way a calm friend would say it. No jargon, no hype, no exclamation marks, no "Oops".
- **Short.** One idea per sentence. Cut filler. When two wordings mean the same, use the shorter one. A section description is one sentence; method or unit notes go behind the ⓘ.
- **Easy on first read.** Say what the user sees and what to do. No stacked clauses, no semicolons joining sentences, no piles of hedges ("may have been … too").
- **Spelled right.** Indian/British English: kilometres, colour, licence (noun). Check spelling of every string you touch.
- **House style.** "58% to 51%" and "30 to 45 km/h", never arrows or dashes for a range. Times "7:15 AM". Money "₹412.80". Zero reads "0". A value that didn't happen shows a grey "—".
- **Say the period once.** A chart names its period at the top, never again underneath (see docs/charts.md).
- **Only known facts.** Never show a guessed time, length or number; show what was seen.

## Telling owners what's new

When a change adds or visibly changes something owners use, add an entry to `lib/whats-new.ts` as a draft. Pick "dialog" (a big feature or visible change, at most 3 per release) or "bell" (a smaller addition) as `docs/whats-new.md` says, plus its `kind` and `icon`, give it the Uplink `version`, and write it with the `uplink-copy` skill. It needs a screenshot in `public/whats-new/` before it leaves draft; entries have no buttons or links. Bug fixes, wording, speed and behind-the-scenes work never get an entry.

## Docs

Read the doc for the area before changing it. Each records decisions the owner made and why.

- `docs/charts.md`: every chart's rules (titles, units, tooltips, axes, scrolling, touch, periods).
- `docs/data-retention.md`: how long data is kept, the drive archive, Tesla token refresh, and how a car that stops sending data is caught and shown (alerts bell).
- `docs/tesla-billing.md`, `docs/costs.md`: what Tesla bills and what Uplink costs to run.
- `docs/whats-new.md`: the welcome tour, the release dialog, page and bell lines, and when an entry is a dialog, a bell line or nothing.
- `docs/fonts.md`: the cut-down Geist files, why they draw exactly as before, and when to rerun `scripts/subset-fonts.py`.

## Checks

Before a commit, all three pass:

- `bunx tsc --noEmit -p .` (run `bunx next typegen` first if it reports missing `PageProps`)
- `bun test` (one file: `bun test test/owners.test.ts`)
- `bun run build`

To see the app with a sample car and no Tesla account: `bun run demo:start` (a built demo copy on port 3210) and `bun run demo:stop`. The `verify` skill drives it for screenshots. Local and live share one Supabase database.

## Before merging

Which checks a change gets is set here, not left to judgement on the day:

- **Every change:** the three checks above.
- **Any page, component or copy change:** drive it on a demo copy (`verify`), desktop and 375px phone, and run `.claude/skills/verify/scripts/launch-checklist.mjs`. Look at the screenshots, don't hand the owner a checklist.
- **No layout shift:** pending and loading states keep their size; launch-checklist measures it.
- **Screenshots in the PR:** a PR that changes anything an owner sees carries screenshots of each changed state (desktop, and the 375px phone where its layout differs), taken on a demo copy. Host them in a secret gist on the owner's GitHub (`gh gist create`, then clone it and push the images) and put them in the PR description as images. Never on a branch: deleting the old `pr-screenshots` branch blanked the images in #26 to #33. Screenshots taken only to check something yourself don't need to go in.
- **Any logic change** (server code, data, Tesla answers, alerts, setup): a test that fails first, built from a real answer's shape where there is one.
- **Big PRs** (any logic change, more than about 200 changed lines, or more than one area of the app): run `/code-review` on the PR before merge, fix what it confirms, and say in the PR what it found. A subagent's own review doesn't count.
- **Security-critical changes**: run `/security-review` before merge whenever a change touches sign-in, sessions or cookies (`proxy.ts`, `lib/server/auth.ts`), admin checks, Tesla tokens or their refresh (`lib/server/tesla.ts`), connector tokens or `/api/mcp`, invites, the waitlist or the owner cap, sharing, API or cron routes and their secrets, file uploads, encryption, or database access rules and migrations. Both reviews when both apply.
- **Launch QA** (`launch-qa` skill, the five personas): before inviting more owners, before a major feature goes live, and after changes to the way in (home, waitlist, invite, sign-in, setup).
- **Migrations:** additive only. The code must work with and without the new column. Read the SQL before it's applied.
- **After merge:** check the merged commit on main: both Vercel production deployments (getuplink.in, uplink-demo) and the main CI run. Report them with the merge; if one fails, read its build logs and say why first.

## Worktrees

Work in a worktree under `.claude/worktrees/<branch>`. Keep the number small: related changes, and small follow-ups to work still open, go into a worktree that's already open. Only start a new one when work must ship separately (an urgent fix) or would clash with what's open. Once its branch is merged to main, remove the worktree and delete the branch straight away (`git worktree remove`, `git branch -d`) without asking. First copy over any gitignored files the main checkout needs (such as `certificates/`). Keep a worktree only while it still holds unmerged work. Stop any demo copies you started there (`cleanup.sh <port>`) at the same time. Leave other sessions' worktrees alone.
