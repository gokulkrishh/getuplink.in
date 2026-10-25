"use client";

import { useRef } from "react";
import { FloatTip, useActiveMark } from "@/components/stats/float-tip";
import { chargeStarts, SLOTS, slotLabel, WEEKDAYS } from "@/lib/charge-habits";
import { cn } from "@/lib/utils";

const AXIS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

const describe = (day: number, slot: number, count: number) => `${WEEKDAYS[day]}, ${slotLabel(slot)} · ${count} ${count === 1 ? "charge" : "charges"}`;

// When charges start, by weekday and time of day (IST), after TeslaMate's charge heatmap. Hover, focus
// or tap a cell for a tooltip with its count; the line above names the busiest slot.
export function ChargeHabits({ starts }: { starts: number[] }) {
  const counts = chargeStarts(starts);
  const max = Math.max(0, ...counts.flat());
  const grid = useRef<HTMLDivElement>(null);
  const [active, setActive] = useActiveMark<[number, number]>(grid);
  if (max === 0) return null;
  let busiest: [number, number] = [0, 0];
  counts.forEach((row, d) => row.forEach((n, s) => n > counts[busiest[0]][busiest[1]] && (busiest = [d, s])));
  const isActive = (d: number, s: number) => active?.key[0] === d && active?.key[1] === s;

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">When you charge</h2>
        <p className="text-sm text-muted-foreground tabular-nums">Most often {describe(busiest[0], busiest[1], counts[busiest[0]][busiest[1]])}</p>
      </div>
      <div ref={grid} className="chart-touch relative space-y-1.5" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
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
                  n === 0 ? "bg-muted" : "bg-chart-accent",
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
              {counts[active.key[0]][active.key[1]]} {counts[active.key[0]][active.key[1]] === 1 ? "charge" : "charges"}
            </span>
          </FloatTip>
        )}
        <div className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] gap-1.5 text-xs text-faint" aria-hidden="true">
          <span />
          {AXIS.slice(0, SLOTS).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
