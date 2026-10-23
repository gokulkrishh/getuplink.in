"use client";

import { useState } from "react";
import { chargeStarts, SLOTS, slotLabel, WEEKDAYS } from "@/lib/charge-habits";
import { cn } from "@/lib/utils";

const AXIS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

const describe = (day: number, slot: number, count: number) => `${WEEKDAYS[day]}, ${slotLabel(slot)} · ${count} ${count === 1 ? "charge" : "charges"}`;

// When charges start, by weekday and time of day (IST), after TeslaMate's charge heatmap. Hover, focus
// or tap a cell for its count; the line above shows the busiest slot until then.
export function ChargeHabits({ starts }: { starts: number[] }) {
  const counts = chargeStarts(starts);
  const max = Math.max(0, ...counts.flat());
  const [active, setActive] = useState<[number, number] | null>(null);
  if (max === 0) return null;
  let busiest: [number, number] = [0, 0];
  counts.forEach((row, d) => row.forEach((n, s) => n > counts[busiest[0]][busiest[1]] && (busiest = [d, s])));
  const shown = active ?? busiest;

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">When you charge</h2>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {active ? describe(shown[0], shown[1], counts[shown[0]][shown[1]]) : `Most often ${describe(busiest[0], busiest[1], counts[busiest[0]][busiest[1]])}`}
        </p>
      </div>
      <div className="space-y-1.5" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
        {counts.map((row, d) => (
          <div key={WEEKDAYS[d]} className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] items-center gap-1.5">
            <span className="text-xs text-faint">{WEEKDAYS[d]}</span>
            {row.map((n, s) => (
              <button
                key={s}
                type="button"
                aria-label={describe(d, s, n)}
                aria-pressed={active?.[0] === d && active?.[1] === s}
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive([d, s])}
                onFocus={() => setActive([d, s])}
                onClick={() => setActive([d, s])}
                className={cn(
                  "h-6 outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring max-sm:h-7",
                  n === 0 ? "bg-muted" : "bg-chart-accent",
                  active?.[0] === d && active?.[1] === s && "ring-2 ring-foreground",
                )}
                style={n === 0 ? undefined : { opacity: 0.25 + (0.75 * n) / max }}
              />
            ))}
          </div>
        ))}
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
