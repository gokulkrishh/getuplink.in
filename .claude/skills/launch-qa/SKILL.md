---
name: launch-qa
description: Launch QA for Uplink - five first-time owners (impatient, skeptic, phone on slow 3G, literal English reader, breaker) walk the app from the home page to the dashboard in a real browser, their findings are ranked by how many hit each, fixed in one pass in a worktree, and the same five rerun to prove it. Use before a major feature goes live, before inviting more owners, after changes to the way in (home, waitlist, invite, setup, sign-in), or when asked for launch QA, a persona run or "try to break it".
---

# Launch QA

A full run is about ten subagents (five before, five after) plus fix agents, so keep it for launches and big changes. For one page, use `verify-uplink` instead.

## 1. Start
- Launch a demo copy of the code under test on its own port (`.claude/skills/verify-uplink/scripts/launch.sh 3220`). Never use the owner's 3000, or a demo copy someone else started. Run `doctor.sh`. A failing `/settings` on an old copy is staleness, not a finding.
- Warm every route once with curl, so dev compile time isn't read as slowness.
- Demo never writes to the shared Supabase. Never drive live forms.

## 2. Before round
- Write the shared brief (route list, demo limits, output JSON) to the scratchpad, then spawn the five personas from `personas.md` in one message, in parallel (Sonnet). Each saves screenshots to `<scratch>/qa/evidence/<persona>-before/`.
- While they run, create the fix worktree (`git worktree add -b <branch> .claude/worktrees/<branch>`, then `bun install`).
- Bring in anything new on main before fixing (`git fetch`, `git merge --ff-only origin/main` when nothing overlaps). Tell the after round about new UI.

## 3. Merge and rank
- Merge findings on route + element and rank by how many personas hit them. Save it as `RANKED.md` in the scratchpad.
- Check scraped claims before fixing (unit spacing, ⓘ counts, tap sizes measured from the visible box).
- Split the list in two:
  - **Fix directly:** layout, copy, dead ends, error handling.
  - **The owner's wording:** privacy, terms, prices, legal promises. Quote each change before and after for approval.

## 4. Fix in one pass
- Run fix agents in parallel, each owning a list of files. A shared brief requires loading `uplink-copy` before any string, fixing the same issue everywhere it appears, and listing hand-offs for files it doesn't own. Sonnet for copy and funnel, Opus for error handling and bugs.
- Apply the hand-offs yourself. Review cross-cutting changes, such as a shared format helper or a time zone, against what the owner has decided before keeping them.
- Run `bunx tsc --noEmit -p .`, `bun test` and `bun run build` in the worktree.

## 5. After round
- Launch a demo copy of the worktree on another port (`launch.sh` copies the checkout it runs from).
- Resume the same five persona agents with SendMessage, so they keep their findings. Each repeats its own findings first (fixed / still broken / new, with new screenshots), then walks the journey again for regressions.
- Fix what's new and rerun the affected checks.

## 6. Prove it and hand over
- Run `.claude/skills/verify-uplink/scripts/launch-checklist.mjs` (desktop and 375px phone, PASS/FAIL). Extend it with checks for this run's fixes. Use `before-after.mjs <old port> <new port> <routes>` for screenshots side by side. Look at the phone screenshots yourself. Don't hand the owner a click-through checklist.
- Report:
  - what was run
  - the ranked table (problem, how many personas, now fixed or not)
  - what is still open and why
  - what demo can't reach (Tesla sign-in, real key pairing, a valid invite, real alerts)
  - "Pending from you"
- Leave everything uncommitted until the owner approves. Then commit, merge to main, and copy any gitignored local files (such as `certificates/`) the owner's checkout needs.
- Clean up every demo copy you started (`cleanup.sh <port>`).
