"use client";

import { useRef } from "react";
import { ChartCard } from "@/components/chart-card";
import { FloatTip, useActiveMark } from "@/components/stats/float-tip";
import { chargeStarts, SLOTS, slotLabel, WEEKDAYS } from "@/lib/charge-habits";
import { formatHour } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Measure } from "@/components/measure";

// The start of each 3-hour slot, as the app writes times ("12 AM", "3 AM" ...), written from the column's
// left edge, so it marks where the block begins like a clock's tick; the tooltip and the line above say
// the whole span ("6 PM to 9 PM"). On a phone every other one shows (12 AM, 6 AM, 12 PM, 6 PM), since
// "12 AM" is wider than a column there.
const AXIS = Array.from({ length: 8 }, (_, k) => formatHour(k * 3));

const charges = (n: number) => `${n} ${n === 1 ? "charge" : "charges"}`;
const describe = (day: number, slot: number, count: number) => `${WEEKDAYS[day]}, ${slotLabel(slot)} · ${charges(count)}`;

// When charges start, by weekday and time of day (IST), after TeslaMate's charge heatmap. Hover, focus
// or tap a cell for a tooltip with its count; the line above names the busiest slot. `title` names the
// span the starts fall in, and `words` ends "No charges …" for a span without any; the grid stays, so the
// page keeps its shape.
export function ChargeHabits({ starts, title, words }: { starts: number[]; title: string; words: string }) {
  const counts = chargeStarts(starts);
  const max = Math.max(0, ...counts.flat());
  const grid = useRef<HTMLDivElement>(null);
  const [active, setActive] = useActiveMark<[number, number]>(grid);
  let busiest: [number, number] = [0, 0];
  counts.forEach((row, d) => row.forEach((n, s) => n > counts[busiest[0]][busiest[1]] && (busiest = [d, s])));
  const isActive = (d: number, s: number) => active?.key[0] === d && active?.key[1] === s;

  return (
    <ChartCard
      title="When you charge"
      description="When charges started, India time."
      info="By weekday and 3-hour block of the day, from the charges listed on this page."
      summary={
        <p className="text-sm tabular-nums">
          {max === 0 ? (
            <span className="text-muted-foreground">No charges {words}.</span>
          ) : (
            <>
              <span className="text-muted-foreground">Most often </span>
              {WEEKDAYS[busiest[0]]}, {slotLabel(busiest[1])}
              <span className="text-muted-foreground">
                , {counts[busiest[0]][busiest[1]]} {counts[busiest[0]][busiest[1]] === 1 ? "charge" : "charges"}
              </span>
            </>
          )}
        </p>
      }
      caption={title}
    >
      <div ref={grid} className="chart-touch relative space-y-1.5 bg-muted p-3 dark:bg-card" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
        {counts.map((row, d) => (
          <div key={WEEKDAYS[d]} className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] items-center gap-1.5">
            <span className="text-xs text-faint">{WEEKDAYS[d]}</span>
            {row.map((n, s) => (
              <button
                key={s}
                type="button"
                aria-label={describe(d, s, n)}
                aria-pressed={isActive(d, s)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive({ key: [d, s], el: e.currentTarget })}
                onFocus={(e) => setActive({ key: [d, s], el: e.currentTarget })}
                onClick={(e) => setActive({ key: [d, s], el: e.currentTarget })}
                className={cn(
                  "h-6 outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring max-sm:h-7",
                  n === 0 ? "bg-background" : "bg-chart-accent",
                  isActive(d, s) && "ring-2 ring-foreground",
                )}
                style={n === 0 ? undefined : { opacity: 0.25 + (0.75 * n) / max }}
              />
            ))}
          </div>
        ))}
        {active && (
          <FloatTip anchor={active.el}>
            <span className="block text-muted-foreground">
              {WEEKDAYS[active.key[0]]}, {slotLabel(active.key[1])}
            </span>
            <span className="block font-mono">
              <Measure text={`${counts[active.key[0]][active.key[1]]} ${counts[active.key[0]][active.key[1]] === 1 ? "charge" : "charges"}`} />
            </span>
          </FloatTip>
        )}
        <div className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] gap-1.5 text-xs text-faint" aria-hidden="true">
          <span />
          {AXIS.slice(0, SLOTS).map((label, k) => (
            <span key={label} className={cn("whitespace-nowrap", k % 2 === 1 && "max-sm:invisible")}>
              {label}
            </span>
          ))}
        </div>
        {/* What the shades mean: an empty square had none, the lightest one charge, the darkest the most. */}
        {max > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 bg-background" aria-hidden="true" />
              None
            </span>
            <span className="inline-flex items-center gap-1.5">
              {max > 1 && <span>{charges(1)}</span>}
              <span
                className="h-2.5 w-12"
                aria-hidden="true"
                style={{ background: max > 1 ? "linear-gradient(to right, color-mix(in srgb, var(--chart-accent) 25%, transparent), var(--chart-accent))" : "var(--chart-accent)" }}
              />
              <span>{charges(max)}</span>
            </span>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
