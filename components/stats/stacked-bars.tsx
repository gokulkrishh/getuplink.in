"use client";

import { useState } from "react";
import { BarTip, ChartFrame, leadingTrimmed, MIN_COLUMNS, MonthLabel, niceMax } from "@/components/stats/bars";
import { TapColumns } from "@/components/stats/tap-columns";
import { cn } from "@/lib/utils";

export type StackedBar = { key: string; label: string; total: number; display: string; isCurrent: boolean; segments: number[] };
export type StackedSeries = { label: string; className: string };

const kwh = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Same look as Bars, with each column split into series (first series at the bottom). Tones tell the
// series apart and a 2px gap separates them. The legend sits under the panel, so side-by-side panels
// line up, and each entry turns its series on or off.
export function StackedBars({ bars: all, series, ariaLabel }: { bars: StackedBar[]; series: StackedSeries[]; ariaLabel: string }) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const dense = all.length > 6;
  const used = series.map((s, i) => ({ ...s, i })).filter(({ i }) => all.some((b) => b.segments[i] > 0));
  const shownTotal = (b: StackedBar) => b.segments.reduce((sum, v, i) => sum + (hidden.has(i) ? 0 : v), 0);
  const bars = leadingTrimmed(all, (b) => b.total > 0);
  const max = niceMax(Math.max(1, ...bars.map(shownTotal)));
  const breakdown = (b: StackedBar) =>
    series.map((s, i) => (b.segments[i] > 0 && !hidden.has(i) ? `${s.label} ${b.segments[i].toFixed(1)} kWh` : null)).filter(Boolean);
  const toggle = (i: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < used.length - 1) next.add(i); // keep at least one series showing
      return next;
    });

  return (
    <div className="space-y-3">
      <ChartFrame max={max} dense={dense} unit="kWh">
        <TapColumns
          className={cn("grid items-end", dense ? "gap-1" : "gap-3")}
          style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, MIN_COLUMNS)}, minmax(0, 1fr))` }}
          aria-label={ariaLabel}
        >
          {bars.map((b, k) => {
            const total = shownTotal(b);
            return (
              <li key={b.key} className="group relative flex flex-col items-center gap-2">
                <BarTip at={k} of={bars.length} lines={[`${total.toFixed(1)} kWh in total`, ...breakdown(b)]} title={b.label} />
                {!dense && <span className="font-mono text-xs text-muted-foreground tabular-nums">{kwh.format(total)}</span>}
                <div className="flex h-20 w-full items-end">
                  {total > 0 && (
                    <div className="flex w-full flex-col-reverse gap-0.5" style={{ height: `${Math.max(4, (total / max) * 100)}%` }}>
                      {series.map((s, i) =>
                        b.segments[i] > 0 && !hidden.has(i) ? (
                          <div key={s.label} className={cn("min-h-px", s.className)} style={{ flex: `${b.segments[i]} 1 0%` }} />
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
                <span className={cn("text-xs whitespace-nowrap", b.isCurrent ? "text-foreground" : "text-faint")}>
                  <MonthLabel label={b.label} dense={dense} fromEnd={bars.length - 1 - k} />
                </span>
                <span className="sr-only">
                  {dense && `${kwh.format(total)} kWh. `}
                  {breakdown(b).join(", ")}
                </span>
              </li>
            );
          })}
        </TapColumns>
      </ChartFrame>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Show or hide a charger type">
        {used.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              aria-pressed={!hidden.has(s.i)}
              onClick={() => toggle(s.i)}
              className={cn(
                "relative flex items-center gap-1.5 transition-colors duration-150 after:absolute after:-inset-y-1.5 after:inset-x-0 max-sm:after:-inset-y-2.5",
                hidden.has(s.i) ? "text-faint line-through" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2", s.className, hidden.has(s.i) && "opacity-30")} aria-hidden="true" />
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
