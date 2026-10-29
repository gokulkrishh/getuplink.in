# Persona run: five first-time owners try to break it

Use before a launch, before inviting more owners, or after a change to the way in (home, waitlist, invite, setup). Each persona is its own subagent driving the demo copy in a real browser. It costs about 5 subagents twice (before and after), so it isn't for a single-page change.

## The five
1. **Impatient**: skims, clicks the most prominent button, quits at the first error or dead end. Counts clicks from /home to the dashboard.
2. **Skeptic**: reads home, privacy, terms and Settings before signing up. Compares retention, location and sharing claims across pages and against the code (`lib/telemetry-retention.ts`, `lib/drive-archive.ts`, `docs/data-retention.md`). Quotes conflicting sentences.
3. **Mobile**: 375x812, touch, slow 3G through CDP (`Network.emulateNetworkConditions` latency 400, 500 kbps; `Emulation.setCPUThrottlingRate` 4). Checks `scrollWidth`, tap targets by real hit area (`elementFromPoint` at the edges: header links use an invisible `::after` tap area), overlap, load timings. Warm every route first so dev compile time isn't read as network.
4. **Non-native English reader**: does only what the page literally says. Flags idioms, undefined words and missing next steps against the `uplink-copy` skill. Unit spacing in scraped text is unreliable (value and unit are separate spans).
5. **Breaker**: junk in every input, double-clicks, back mid-flow, odd URLs, and the network cut during every server action (`context.setOffline(true)`). Demo actions return early, so validation claims come from reading the action's non-demo branch, labelled as code findings.

## The journey (demo limits)
/home, /privacy, /terms, /waitlist, /invite/<token>, /setup, /setup?step=done, then / as first success, a Stats page and Settings. Demo skips Tesla sign-in and key pairing, a valid invite and real alerts: say so in the report.

## Rounds
- **Before**: each persona returns JSON `{id, route, element, step, expected, saw, screenshot, severity, kind}`. Merge on route + element and rank by how many personas hit it.
- **Fix** in a worktree, each fix agent owning its own files.
- **After**: resume the same persona agents (SendMessage) on a demo copy of the branch. Each repeats its own findings first (fixed / still broken / new), then walks the journey again for regressions.
- End with `.claude/skills/verify-uplink/scripts/launch-checklist.mjs` and `before-after.mjs` (see SKILL.md step 6).
