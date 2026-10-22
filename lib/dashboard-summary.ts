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
  const change = changeFrom(current, previous, opts);
  if (!change) return null;
  if (change.same) return { text: `Same as ${span}`, tone: "neutral" };
  const amount = typeof unit === "function" ? unit(change.amount) : `${change.amount.toFixed(opts.decimals ?? 0)} ${unit}`;
  return { text: `${amount} ${change.word} than ${span}`, tone: change.tone };
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
  return { same, amount, word, tone };
}
