// The tips a box shows and which one is up (components/home/week-tips.tsx AiNotes).
export type TipsState<T extends { text: string }> = {
  // The tips from the server, as the page last rendered them.
  given: T[];
  // Tips swapped in for ones voted down.
  added: T[];
  // Voted not useful, by text.
  hidden: string[];
  // Dismissed in this browser, by text.
  dismissed: string[];
  // Where the box was turned to.
  at: number;
  // A tip the box was sent to by its text (a swapped-in tip, or one brought back by Undo).
  on?: string | null;
};

// Each tip once, by its text: a vote renders the page again (app/tip-actions.ts updateTag), so a tip the box
// swapped in can come back from the server in `given` too. The box stays on `on` wherever it now sits, else
// on `at`.
export function tipsInView<T extends { text: string }>({ given, added, hidden, dismissed, at, on = null }: TipsState<T>): { tips: T[]; index: number } {
  const seen = new Set([...hidden, ...dismissed]);
  const tips: T[] = [];
  for (const t of [...given, ...added]) {
    if (seen.has(t.text)) continue;
    seen.add(t.text);
    tips.push(t);
  }
  if (tips.length === 0) return { tips, index: 0 };
  const found = on === null ? -1 : tips.findIndex((t) => t.text === on);
  return { tips, index: found >= 0 ? found : at % tips.length };
}

// The index one step back (-1) or on (1), wrapping round.
export function turn(view: { tips: unknown[]; index: number }, by: 1 | -1): number {
  const n = view.tips.length;
  return n === 0 ? 0 : (view.index + by + n) % n;
}

// The text of the tip a turn lands on, for the box to stay on by its text: a vote renders the page again,
// and the server may list the tips in another order. Null when there are none.
export function turnedTo(view: { tips: { text: string }[]; index: number }, by: 1 | -1): string | null {
  return view.tips[turn(view, by)]?.text ?? null;
}
