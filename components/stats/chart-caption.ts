import type { Slot, Span } from "@/lib/periods";

// Plain words under a chart: what it plots, over which bars, and what a unit means, for an owner who
// doesn't read kWh or kW at a glance.

// What a unit measures, said once under a chart that uses it.
export const UNIT_WORDS: Record<string, string> = {
  kWh: "kWh (kilowatt-hours) is energy, the same unit as on an electricity bill",
  kW: "kW (kilowatts) is power, how fast energy flows",
  "m/s²": "m/s² is how quickly the car sped up or slowed down",
  "°C": "°C is degrees Celsius",
};

// "kWh (kilowatt-hours) is energy, …." for each unit given that has words, in order, once each.
export function unitNotes(units: (string | undefined)[]): string {
  const words = [...new Set(units)].flatMap((u) => (u && UNIT_WORDS[u] ? [`${UNIT_WORDS[u]}.`] : []));
  return words.join(" ");
}

// The bars a chart draws and the span they stand for. `title` heads the span ("Last 7 days", "This year",
// "1 Sept to 30 Sept"); `slotName` names one bar ("day", "month", "3 hours").
type Bars = { slots: Pick<Slot, "label" | "from">[]; slotName: string; title: string; span: Pick<Span, "from"> };

// "Kilometres driven each day, last 7 days": what a bar chart plots and over which bars. When the bars
// cover the span exactly (Day, Week, Year, a picked range) the span's title names them; when they reach
// past it (Month draws the last 6 months, All the last 6 years) the first and last bar do, so the words
// always match the chart and not the headline above it.
export function barsCaption(what: string, { slots, slotName, title, span }: Bars): string {
  const each = slotName === "3 hours" ? "every 3 hours" : `each ${slotName}`;
  const first = slots[0];
  const last = slots.at(-1);
  if (!first || !last) return `${what} ${each}`;
  const where =
    first.from === span.from ? title.charAt(0).toLowerCase() + title.slice(1) : first === last ? first.label : `${first.label} to ${last.label}`;
  return `${what} ${each}, ${where}`;
}
