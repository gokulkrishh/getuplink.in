"use client";

import { useRef, useState } from "react";
import { ChartFrame, EmptyChart, niceMax } from "@/components/stats/bars";
import { useAxisLabels, useBarTips, useValueLabels } from "@/components/stats/axis-labels";
import { AxisLabel, BAR_MAX, barOpens, BarTip, barTitle, Column, MIN_COLUMN_PX, MIN_COLUMNS, ValueLabel } from "@/components/stats/bar-parts";
import type { View } from "@/components/stats/periods";
import { ScrollEnd } from "@/components/stats/scroll-end";
import { TapColumns } from "@/components/stats/tap-columns";
import { DECIMALS, formatKwh, formatNumber, showsZero } from "@/lib/format";
import type { SlotDays } from "@/lib/periods";
import { cn } from "@/lib/utils";

// `blank` draws the column empty with no tip (a slot ahead of now); without it, columns before the first
// value are blank (before the history starts). `axis` and `edge` label the x axis, and `days` is what the
// column opens, as in Bar.
export type StackedBar = { key: string; label: string; total: number; display: string; isCurrent: boolean; segments: number[]; blank?: boolean; axis?: string; edge?: boolean; days?: SlotDays };
export type StackedSeries = { label: string; className: string };

// Each segment, column total and tip line is rounded on its own, to the energy rule (see lib/format.ts).
const kwh = { format: (n: number) => formatNumber(n, DECIMALS.kWh) };

// Same look as Bars, with each column split into series (first series at the bottom). Tones tell the
// series apart and a 2px gap separates them. The legend sits under the panel, so side-by-side panels
// line up, and each entry turns its series on or off. With empty, a period with nothing says so in one line
// instead. As in Bars, every period draws one box and every slot keeps its column; `caption` goes
// under the legend. With labelEvery, any number of columns, labelled as in Bars. A column of a day, a
// month or a year opens it, as in Bars (`view` names the page a month or year opens on).
export function StackedBars({
  bars: all,
  series,
  ariaLabel,
  empty,
  labelEvery,
  caption,
  fit = false,
  view,
}: {
  bars: StackedBar[];
  series: StackedSeries[];
  ariaLabel: string;
  empty?: string;
  labelEvery?: number;
  caption?: string;
  // Squeeze every column into the panel's width instead of scrolling sideways, as in Bars.
  fit?: boolean;
  view?: View;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  // Labels show as many as fit, never fewer apart than labelEvery (see useAxisLabels).
  const box = useRef<HTMLDivElement>(null);
  useAxisLabels(box, labelEvery);
  useValueLabels(box);
  useBarTips(box);
  if (empty && !all.some((b) => b.total > 0 && !showsZero(kwh.format(b.total)))) return <EmptyChart>{empty}</EmptyChart>;
  const dense = all.length > 6;
  const used = series.map((s, i) => ({ ...s, i })).filter(({ i }) => all.some((b) => b.segments[i] > 0));
  const shownTotal = (b: StackedBar) => b.segments.reduce((sum, v, i) => sum + (hidden.has(i) ? 0 : v), 0);
  const bars = all;
  // Slots before the history starts keep their column and label, with nothing drawn.
  const first = bars.findIndex((b) => b.total > 0);
  const max = niceMax(Math.max(1, ...bars.map(shownTotal)));
  // A segment that shows as 0.0 kWh is neither drawn nor listed, as a column is (see showsZero).
  const shows = (v: number) => v > 0 && !showsZero(kwh.format(v));
  const breakdown = (b: StackedBar) =>
    series.map((s, i) => (shows(b.segments[i]) && !hidden.has(i) ? `${s.label} ${formatKwh(b.segments[i])}` : null)).filter(Boolean);
  const toggle = (i: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < used.length - 1) next.add(i); // keep at least one series showing
      return next;
    });

  // As in Bars: columns no narrower than MIN_COLUMN_PX, scrolling sideways from the newest end if need be.
  const columns = labelEvery ? bars.length : Math.max(bars.length, MIN_COLUMNS);
  const list = (
    <TapColumns
      className={cn("grid items-end", fit && columns > 31 ? "gap-px" : labelEvery ? "gap-0.5" : dense ? "gap-1" : "gap-3")}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={ariaLabel}
    >
      {bars.map((b, k) => {
        const total = shownTotal(b);
        // A column that shows as 0.0 kWh draws nothing, has no tip and opens nothing, as in BarColumns.
        if ((b.blank ?? k < first) || showsZero(kwh.format(total)))
          return (
            <li key={b.key} aria-hidden="true" className="relative flex flex-col items-center gap-2">
              <span className="h-4" />
              <div className="h-20" />
              <AxisLabel label={b.axis ?? b.label} edge={b.edge} first={k === 0} />
            </li>
          );
        const opens = barOpens(b.days, view);
        return (
          <li key={b.key} className="group relative">
            <BarTip lines={[`${formatKwh(total)} in total`, ...breakdown(b)]} title={barTitle(b)} opens={opens} />
            <Column opens={opens} words={[barTitle(b), formatKwh(total), ...breakdown(b)].join(", ")}>
              {dense ? <span className="h-4" /> : <ValueLabel display={kwh.format(total)} unit="kWh" />}
              <div className="flex h-20 w-full items-end justify-center">
                {total > 0 && (
                  <div className={cn("flex w-full flex-col-reverse gap-0.5", BAR_MAX)} style={{ height: `${Math.max(4, (total / max) * 100)}%` }}>
                    {series.map((s, i) =>
                      shows(b.segments[i]) && !hidden.has(i) ? (
                        <div key={s.label} className={cn("min-h-px", s.className)} style={{ flex: `${b.segments[i]} 1 0%` }} />
                      ) : null,
                    )}
                  </div>
                )}
              </div>
              <AxisLabel label={b.axis ?? b.label} current={b.isCurrent} edge={b.edge} first={k === 0} />
            </Column>
          </li>
        );
      })}
    </TapColumns>
  );
  return (
    <div className="space-y-3">
      <ChartFrame max={max} unit="kWh">
        {/* As in BarColumns: too many columns to fit, it scrolls sideways from its newest end. */}
        <ScrollEnd label={ariaLabel}>
          <div ref={box} style={fit ? undefined : { minWidth: columns * MIN_COLUMN_PX }}>
            {list}
          </div>
        </ScrollEnd>
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
      {caption && <p className="text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
