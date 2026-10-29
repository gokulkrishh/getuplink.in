import type { KeyboardEvent } from "react";

// The focus ring on a chart's plot, as on the other charts' marks.
export const PLOT_FOCUS = "outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring";

// Evenly spaced x values from one end of a chart to the other, for a chart with no discrete readings to step
// through (a trace of a drive).
export function evenStops(from: number, to: number, count = 48): number[] {
  return Array.from({ length: count + 1 }, (_, k) => from + ((to - from) * k) / count);
}

// Keyboard for a chart's plot, so its tooltip isn't pointer-only. Left and Right step the cursor `at` through
// `stops` (the first press starts at the newest on Left and the oldest on Right), Home and End jump to the
// ends, and Esc or leaving the chart hides the tooltip. Spread the result on the focusable plot.
export function plotKeys(at: number | null, setAt: (x: number | null) => void, stops: number[]) {
  return {
    tabIndex: 0,
    onBlur: () => setAt(null),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape") return setAt(null);
      const last = stops.length - 1;
      if (last < 0) return;
      const here = at === null ? -1 : stops.reduce((a, v, k) => (Math.abs(v - at) < Math.abs(stops[a] - at) ? k : a), 0);
      const next =
        e.key === "ArrowRight" ? (here < 0 ? 0 : Math.min(last, here + 1))
        : e.key === "ArrowLeft" ? (here < 0 ? last : Math.max(0, here - 1))
        : e.key === "Home" ? 0
        : e.key === "End" ? last
        : null;
      if (next === null) return;
      e.preventDefault();
      setAt(stops[next]);
    },
  };
}
