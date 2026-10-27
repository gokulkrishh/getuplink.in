<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Fix it everywhere

When asked to fix something (a bug, a layout problem, a copy or style issue), check the whole app for the same issue and fix every instance, not just the one reported. Say in the summary where else it was found and fixed.

## Writing copy

Every word a user sees (labels, descriptions, ⓘ notes, captions, empty states, errors, buttons, Settings, Admin, the home page) follows these rules. Check any string you add or change against them.

- **Human and plain.** Write the way a calm friend would say it. No jargon, no hype, no exclamation marks, no "Oops".
- **Short.** One idea per sentence. Cut filler. When two wordings mean the same, use the shorter one. A section description is one sentence; method or unit notes go behind the ⓘ.
- **Easy on first read.** Say what the user sees and what to do. No stacked clauses, no semicolons joining sentences, no piles of hedges ("may have been … too").
- **Spelled right.** Indian/British English: kilometres, colour, licence (noun). Check spelling of every string you touch.
- **House style.** "58% to 51%" and "30 to 45 km/h", never arrows or dashes for a range. Times "7:15 AM". Money "₹412.80". Zero reads "0". A value that didn't happen shows a grey "—".
- **Say the period once.** A chart names its period at the top, never again underneath (see docs/charts.md).
- **Only known facts.** Never show a guessed time, length or number; show what was seen.
