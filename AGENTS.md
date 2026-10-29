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

## Docs

Read the doc for the area before changing it. Each records decisions the owner made and why.

- `docs/charts.md`: every chart's rules (titles, units, tooltips, axes, scrolling, touch, periods).
- `docs/data-retention.md`: how long data is kept, the drive archive, Tesla token refresh, and how a car that stops sending data is caught and shown (alerts bell).
- `docs/tesla-billing.md`, `docs/costs.md`: what Tesla bills and what Uplink costs to run.

## Checks

Before a commit, all three pass:

- `bunx tsc --noEmit -p .` (run `bunx next typegen` first if it reports missing `PageProps`)
- `bun test` (one file: `bun test test/owners.test.ts`)
- `bun run build`

To see the app with a sample car and no Tesla account: `bun run demo:start` (a built demo copy on port 3210) and `bun run demo:stop`. The `verify-uplink` skill drives it for screenshots. Local and live share one Supabase database.

## Worktrees

Work in a worktree under `.claude/worktrees/<branch>`, one per task. Once its branch is merged to main, remove the worktree and delete the branch straight away (`git worktree remove`, `git branch -d`) without asking. First copy over any gitignored files the main checkout needs (such as `certificates/`). Keep a worktree only while it still holds unmerged work. Stop any demo copies you started there (`cleanup.sh <port>`) at the same time. Leave other sessions' worktrees alone.
