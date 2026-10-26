import type { Slot, Span } from "@/lib/periods";

// Plain words under a chart: what it plots, over which bars, and what a unit means, for an owner who
// doesn't read kWh or kW at a glance.

// What a unit measures, said once under a chart that uses it: the glossary lives in lib/unit-words.ts,
// shared with tiles.
export { UNIT_WORDS, unitNotes, unitWords } from "@/lib/unit-words";

// The bars a chart draws and the span they stand for. `title` heads the span ("Last 7 days", "This year",
// "1 Sept to 30 Sept"); `words` ends a sentence ("today", "on 24 Oct"); `slotName` names one bar ("day",
// "month", "hour"). `trimmed`: the bars start at the day tracking began (see fromTracking).
type Bars = { slots: Pick<Slot, "label" | "from">[]; slotName: string; title: string; words: string; span: Pick<Span, "from">; trimmed?: boolean };

// One bar of an hour, for a chart's words: "each hour", the hour as a stretch of time.
export const EACH_HOUR = "each hour";

// "Kilometres driven each day, last 7 days": what a bar chart plots and over which bars. When the bars
// cover the span exactly (Day, Week, Month, Year, a picked range) the span's title names them, and
// "since 23 Oct" when they start at the day tracking began; when they reach past it (All draws the last
// 6 years) the first and last bar do, so the words always match the chart and not the headline above it.
// Hours read "Kilometres driven each hour today".
export function barsCaption(what: string, { slots, slotName, title, words, span, trimmed }: Bars): string {
  if (slotName === "hour") return `${what} ${EACH_HOUR} ${words}`;
  const each = `each ${slotName}`;
  const first = slots[0];
  const last = slots.at(-1);
  if (!first || !last) return `${what} ${each}`;
  const where =
    trimmed || first.from === span.from ? title.charAt(0).toLowerCase() + title.slice(1) : first === last ? first.label : `${first.label} to ${last.label}`;
  return `${what} ${each}, ${where}`;
}
