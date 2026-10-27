---
name: uplink-copy
description: Write, edit or review any text an Uplink user sees - page titles, labels, buttons, ⓘ tooltips, chart captions, empty and "not yet" states, errors, Settings, Admin, setup, invite, waitlist, home, privacy and terms pages, MCP tool descriptions and AI-written drive lines. Use whenever a change adds or touches a user-facing string, even when the task is mainly code or layout.
---

# Uplink copy

Uplink shows Tesla owners in India their software updates, charging spend, battery and driving. Every string must read well to that owner on a phone, on the first pass.

The short rules in `AGENTS.md` ("Writing copy") always apply. This skill adds who we write for, the words we use, patterns per element, and how to check. For general UI-writing craft (confirm dialogs, plurals, link text) also see the `better-writing` skill; where the two differ, this one wins.

## Who reads this

- A Tesla owner in India. Comfortable with their car and their phone. Has never seen code.
- Reads in English, often as a second language. Indian/British spelling.
- Glances at it between other things. Mostly on a phone, often in the car park.
- Cares about: "Is my car OK? When does my update come? What did charging cost? Is my data safe?"

Test every string with: would this owner understand it out loud, without the screen around it?

## Voice

- A calm, knowledgeable friend. Plain, factual, never salesy.
- Uplink is the subject when the product acts: "Uplink never wakes your car", "Uplink will try again". Use "we" and "us" only on privacy, terms and contact copy, where a person is answering.
- "You" and "your car" for the owner. Never "the user" or "the vehicle".
- Calm even when something fails. No "Oops", no "Uh oh", no blame.
- No exclamation marks, no emojis, no hype ("powerful", "seamless", "supercharge your").

## Length

| Element | Target |
| --- | --- |
| Button, tab, label | 1 to 3 words |
| Page or section title | Under 5 words |
| Section description | 1 sentence |
| ⓘ tooltip | 1 or 2 short sentences answering "what does this mean for me?" |
| Empty or "not yet" state | Title under 5 words + 1 sentence |
| Error | 1 or 2 sentences: what happened, what to do |
| Toast / inline confirmation | Under 6 words |

One idea per sentence. No semicolons joining sentences. When two wordings mean the same, use the shorter.

## Words

### Say this, not that

| Use | Not | Notes |
| --- | --- | --- |
| Sign in, Sign in with Tesla | Log in, Login | `Login` may stay in code names, never on screen |
| Sign out | Log out | |
| Disconnect Tesla | Unlink, Remove account | Ends Uplink's access to the Tesla account |
| Delete my data / Delete account | Erase, Wipe, Purge | Two different actions; keep both names exact |
| Revoke | Cancel, Delete | For invite links and access at Tesla |
| update | OTA, firmware, release | The event of new software arriving |
| version | build, release | The number, e.g. 2026.38.5.1 |
| release notes | changelog, patch notes | |
| drive | leg, segment | One drive, start to park. "Legs" only inside a trip's detail |
| trip | journey | Drives with stops under an hour between them |
| charge | charging session, session | One plug-in. "Charging sessions" only as a list title if already used there |
| Supercharger | SC, Tesla charger | The station. "Supercharging spend" for money |
| battery, battery health | pack, SoH, degradation | "Full pack" only in a spec figure label |
| range | estimated range, EPA range | |
| live data, sends data, figures | stream, telemetry, readings, signals, API calls | "Your car sends data while it's awake" |
| awake / asleep, wake | online / offline state, polling | "Online" is fine as a status chip |
| typical, usual | median, mean, average | Say "average" only when it is a true mean and it matters |
| place, home | location, coordinates, geofence | |
| AI | LLM, model | Name Claude, ChatGPT, Grok only where the owner picks one |
| connector | MCP server, MCP | "MCP" only in setup steps where the owner must type or paste it |

Named third-party products and laws (Fleet API, DPDP Act, Supabase, Vercel, Fly.io) may appear on privacy, terms and status pages, always with a plain clause saying what they do: "Supabase stores the database in Mumbai."

### Never on screen

Technical words: API, endpoint, token (except where the owner must copy one), payload, stream, telemetry, median, g, signal, poll, cron, null, undefined, NaN, HTTP codes, stack traces, enum or column names.

Filler and hedges: please, sorry, simply, just, easily, successfully, "may have been", "might possibly", "in order to".

## House style

- Spelling: Indian/British. kilometres, colour, tyres, licence (noun), centre, behaviour, cheque. `-ise` endings: recognise, organise.
- Units: `km`, `km/h`, `kWh`, `%`, with a space before km, km/h and kWh ("24,082 km", "76.4 kWh"), none before % ("72%").
- Numbers: Indian grouping comes from `Intl.NumberFormat("en-IN")`. Never hand-format.
- Money: "₹412.80", "₹24/kWh". Rupee sign, no space, never "Rs" or "INR" on screen.
- Ranges: "58% to 51%", "30 to 45 km/h", "8:18 AM to 8:48 AM". Never arrows, hyphens or en dashes.
- Time: "7:15 AM". Dates "14 Oct", "14 Oct 2025" when the year differs. Months "Sept" as already used in the app.
- Zero reads "0". A value that didn't happen shows a grey "—".
- Sentence case for everything: titles, buttons, tabs, labels. Product and feature names keep theirs: Uplink, Model Y, Sentry Mode, Supercharger.
- No full stop on titles, labels, buttons, chips. Full stop on every full sentence.
- Middle dot "·" joins short facts in one line: "Model Y · Diamond Black".
- A chart names its period once, at the top (see `docs/charts.md`).

## Only known facts

Never show a guessed time, length, cost or number. Show what was seen and say when it's a minimum: "Seen awake is only the time the car was sending data, so the real time may be longer." If a figure isn't known yet, say when it will be: "The battery trend shows up after two weeks."

## Patterns

**Buttons and links.** Verb first, names the action: "Download invoice", "Show release notes", "Check again", "Sign in with Tesla". Never "OK", "Yes", "Submit", "Click here". Link text makes sense alone.

**Section description.** One sentence on what the owner sees. Method and unit notes go behind the ⓘ.
Leave it out when it only restates the title or the headline under it: "Distance" needs no "Kilometres driven.", "Spend" no "What charging cost.". A description earns its line only by adding something the owner wouldn't otherwise know.

**ⓘ tooltip.** Answer "what does this mean for me?", then, only if needed, one sentence on how it's worked out in everyday words.
- Good: "A line that falls means the battery holds less."
- Bad: "The median of weekly BMS-reported nominal full pack energy."

**Not yet / empty states.** Say what will show here and when, or what fills it. Title plus one sentence.
- "No charges yet" + "Your charges will show up here, wherever you plug in."
- "Not enough driving yet" + "Distance and energy use show up after a couple of days of driving."

**Waiting on the car.** Name the cause and that Uplink handles it. Never imply the owner did something wrong. "The car went to sleep during the last check. Uplink will try again."

**Errors.** What happened + what to do, in the owner's terms.
- Good: "Uplink couldn't load this page. Try again in a moment."
- Good: "This invite link has been used. Ask for a new one."
- Bad: "Something went wrong", "Error 401", "Invalid token", "Oops!"
- Map every server or Tesla error to an owner sentence. Never render `error.message`.

**Confirm dialogs.** Only for actions that can't be undone. Title names the action and object as a question, body states the consequence once, button repeats the verb.
- Title "Delete your data?" Body "Uplink deletes everything it has read from your car. You can't undo this." Buttons "Delete my data" / "Cancel".

**Trust and privacy lines.** Short, concrete, about what Uplink can and can't do: "Read-only. Never wakes your car. Revoke access any time." No legal phrasing on product screens.

**AI-written lines** (drive wording, MCP answers). Same rules as code-written copy. The checks in `lib/drive-wording.ts` must stay at least as strict as this skill.

**Admin pages.** The reader is the owner of Uplink, so admin may name env vars and services, but labels, buttons and errors still follow these rules.

## Implementation

- Strings live in the component or page that renders them; there is no i18n layer. Keep a repeated string in one constant in `lib/` rather than retyping it.
- Format numbers, units, dates and times through `lib/format.ts` (`formatKm`, `formatPercent`, `formatClock`, `formatDate`, `formatLevels` for "58% to 51%", and the rest). Add a helper there rather than formatting inline. Never build a sentence by gluing fragments around a value; write the whole sentence as one template.
- Plurals: handle "1 charge" vs "3 charges" explicitly. Never "charge(s)".
- Icon-only buttons need an `aria-label` that follows the button rules.

## Workflow

**Adding or changing a string**
1. Draft it.
2. Check it against the word table, house style and length targets.
3. Read it as the owner, out loud. Cut one more word if the meaning survives.
4. Per `AGENTS.md` "Fix it everywhere": if you fix a wording, search the app for the same wording or term and fix every instance.

**Reviewing or auditing copy**
1. Search `app/`, `components/` and `lib/` for user-facing text: JSX text, `title=`, `label=`, `note=`, `basis=`, `aria-label=`, `placeholder=`, `intro=`, metadata and OG text, FAQ arrays, MCP tool descriptions.
2. Quick scans for common breaks:
   ```bash
   rg -n --glob '*.tsx' -i 'something went wrong|oops|please|successfully|log ?in|kilometer|color\b|\bRs\.?\b|INR|median|telemetry|stream' app components
   rg -n --glob '*.tsx' '[→–]| - \d' app components
   ```
3. Run `bun test test/copy-rules.test.ts`. It checks rendered text for the rules a script can catch (no "Oops" or "!", no arrows or dashes between words, Indian spelling, "30 to 45 km/h" ranges). Keep it passing; extend it when a new rule can be checked by a script.
4. Report one row per root cause, most serious first:

   | Severity | Location | Now | Suggested | Rule |
   | --- | --- | --- | --- | --- |

   High: misleads the owner, shows a guess as fact, or an error with no way forward. Medium: wrong term, jargon, inconsistent wording. Low: length, punctuation, spelling.
5. Fix only when asked, and then fix every instance.
