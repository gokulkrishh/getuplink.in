// Pure helpers for the period comparisons on home.

// Below this a day's or week's distance is too short for Wh/km to mean anything.
export const MIN_EFFICIENCY_KM = 10;

export type Comparison = { text: string; tone: "better" | "worse" | "neutral" };

// "96 km more than 1–22 Sept", "₹410 less than the 7 days before", "Same as 1–22 Sept" (within 2%). `span` is
// the previous span in words (see previousLabel); `unit` is a word after the number, or formats the number
// itself (money). `lowerIsBetter` words the change as better or worse. Null when there is no previous figure.
export function compareToPrevious(
  current: number,
  previous: number | null,
  unit: string | ((amount: number) => string),
  span: string,
  opts: { decimals?: number; lowerIsBetter?: boolean } = {},
): Comparison | null {
  const change = changeToPrevious(current, previous, unit, opts);
  if (!change) return null;
  if (change.direction === "same") return { text: `Same as ${span}`, tone: "neutral" };
  return { text: `${change.amount} ${change.word} than ${span}`, tone: change.tone };
}

// The same change in parts, for the headline's delta line: which way it went, its rounded size with the
// unit ("13 km", "₹171") and compareToPrevious's word for it. Null when there is no previous figure.
export type Change = { direction: "up" | "down" | "same"; amount: string; word: string; tone: Comparison["tone"] };

export function changeToPrevious(
  current: number,
  previous: number | null,
  unit: string | ((amount: number) => string),
  opts: { decimals?: number; lowerIsBetter?: boolean } = {},
): Change | null {
  const change = changeFrom(current, previous, opts);
  if (!change) return null;
  const amount = typeof unit === "function" ? unit(change.amount) : `${change.amount.toFixed(opts.decimals ?? 0)} ${unit}`;
  if (change.same) return { direction: "same", amount, word: "same", tone: "neutral" };
  return { direction: change.up ? "up" : "down", amount, word: change.word, tone: change.tone };
}

// The change as the tail of a sentence: "21.7 km more than the 7 days before", "the same as yesterday".
// Null with nothing to compare: no span before (All), no figure for it (tracking began after it started,
// so it would compare against part of one), or nothing yet this period (a zero has no direction worth
// a sentence). `span` is previousLabel's words.
export function comparedWith(
  current: number | null,
  previous: number | null,
  unit: string | ((amount: number) => string),
  span: string | null,
  opts: { decimals?: number; lowerIsBetter?: boolean } = {},
): string | null {
  if (!current || span === null) return null;
  const change = changeToPrevious(current, previous, unit, opts);
  if (!change) return null;
  return change.direction === "same" ? `the same as ${span}` : `${change.amount} ${change.word} than ${span}`;
}

// A chart's opening line, one sentence: what the period's figure is, then how it compares (see comparedWith)
// when it can. "Driven in the last 7 days, 21.7 km more than the 7 days before." Without a comparison the
// lead stands alone: "Driven in total."
export function headline(lead: string, comparison: string | null): string {
  return `${lead}${comparison ? `, ${comparison}` : ""}.`;
}

// The rounded size and direction of a change. Within 2% of the previous figure counts as the same.
function changeFrom(current: number, previous: number | null, { decimals = 0, lowerIsBetter = false }: { decimals?: number; lowerIsBetter?: boolean }) {
  if (previous === null) return null;
  const diff = current - previous;
  const step = 10 ** -decimals;
  const amount = Math.round(Math.abs(diff) / step) * step;
  const same = amount === 0 || Math.abs(diff) <= Math.abs(previous) * 0.02;
  const up = diff > 0;
  const word = lowerIsBetter ? (up ? "worse" : "better") : up ? "more" : "less";
  const tone: Comparison["tone"] = lowerIsBetter ? (up ? "worse" : "better") : "neutral";
  return { same, up, amount, word, tone };
}
