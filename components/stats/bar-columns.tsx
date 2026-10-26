"use client";

import { useRef } from "react";
import { useAxisLabels } from "@/components/stats/axis-labels";
import { AxisLabel, type Bar, BAR_MAX, BarTip, MIN_COLUMN_PX, MIN_COLUMNS, withUnit } from "@/components/stats/bar-parts";
import { ScrollEnd } from "@/components/stats/scroll-end";
import { TapColumns } from "@/components/stats/tap-columns";
import { cn } from "@/lib/utils";

// Bars' columns, drawn in the browser from the bars themselves: a page sends a few numbers and labels per
// column instead of each column's markup, which a 90-day chart in every period made the bulk of a page.
// `max` is the axis top Bars worked out; see Bars for the rest.
// With `fit`, the columns share the panel's width however many there are, so the chart never scrolls
// sideways; a chart with very many (90 days) gets hairline gaps so its bars keep some width.
export function BarColumns({ bars, max, ariaLabel, labelEvery, unit, fit = false }: { bars: Bar[]; max: number; ariaLabel: string; labelEvery?: number; unit?: string; fit?: boolean }) {
  const dense = bars.length > 6;
  // Slots before the first value (before the history starts) keep their column and label but draw nothing,
  // not even a tip: nothing is known about them.
  const first = bars.findIndex((b) => b.value > 0);
  const hidden = (b: Bar, k: number) => b.blank ?? k < first;
  // Labels show as many as fit, never fewer apart than labelEvery (see useAxisLabels).
  const box = useRef<HTMLDivElement>(null);
  useAxisLabels(box, labelEvery);
  const columns = labelEvery ? bars.length : Math.max(bars.length, MIN_COLUMNS);
  // Too many columns to fit at MIN_COLUMN_PX each, the chart scrolls sideways from its newest end.
  return (
    <ScrollEnd label={ariaLabel}>
    <div ref={box} style={fit ? undefined : { minWidth: columns * MIN_COLUMN_PX }}>
    <TapColumns
      className={cn("grid items-end", fit && columns > 31 ? "gap-px" : labelEvery ? "gap-0.5" : dense ? "gap-1" : "gap-3")}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={ariaLabel}
    >
      {bars.map((b, k) =>
        hidden(b, k) ? (
          <li key={b.key} aria-hidden="true" className="relative flex flex-col items-center gap-2">
            <span className="h-4" />
            <div className="h-20" />
            <AxisLabel label={b.axis ?? b.label} edge={b.edge} first={k === 0} />
          </li>
        ) : (
          <li key={b.key} className="group relative flex flex-col items-center gap-2">
            <BarTip at={k} of={bars.length} lines={[withUnit(b.display, unit), b.tip ?? null]} title={b.label} />
            <span className="h-4 font-mono text-xs text-muted-foreground tabular-nums">{dense ? "" : b.display}</span>
            <div className="flex h-20 w-full items-end justify-center">
              {b.value > 0 && (
                <div
                  className={cn("w-full", BAR_MAX, b.isCurrent ? "bg-chart-accent" : "bg-chart-accent/40 group-hover:bg-chart-accent/70 group-data-[tapped=true]:bg-chart-accent/70")}
                  style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
                />
              )}
            </div>
            {/* The label is as wide as its text and may spill over the neighbouring columns. */}
            <AxisLabel label={b.axis ?? b.label} current={b.isCurrent} edge={b.edge} first={k === 0} />
            {(dense || b.tip) && <span className="sr-only">{[dense && withUnit(b.display, unit), b.tip].filter(Boolean).join(", ")}</span>}
          </li>
        ),
      )}
    </TapColumns>
    </div>
    </ScrollEnd>
  );
}
