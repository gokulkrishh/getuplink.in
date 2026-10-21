"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LevelPoint } from "@/lib/dashboard-summary";
import { cn } from "@/lib/utils";

// Same box as the loaded chart (panel + h-28), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted px-3 pt-4 pb-2">
      <div className="h-28 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./battery-chart-plot"), { ssr: false, loading: Placeholder });

type Range = "day" | "week";

const RANGES: { value: Range; label: string }[] = [
  { value: "day", label: "24 h" },
  { value: "week", label: "7 days" },
];

// Battery level over the last 24 hours or 7 days. A range with fewer than two readings is left out,
// and with none left the chart is too.
export function BatteryChart({ day, week, now }: { day: LevelPoint[]; week: LevelPoint[]; now: number }) {
  const available = RANGES.filter((r) => (r.value === "day" ? day : week).length >= 2);
  const [chosen, setChosen] = useState<Range>("day");
  if (available.length === 0) return null;
  const range = available.some((r) => r.value === chosen) ? chosen : available[0].value;
  return (
    <div className="space-y-2">
      {available.length > 1 && (
        <div className="flex justify-end gap-3 text-xs" role="group" aria-label="Chart range">
          {available.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setChosen(r.value)}
              className={cn("cursor-pointer transition-colors duration-150", range === r.value ? "text-foreground" : "text-faint hover:text-foreground")}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      <Plot points={range === "day" ? day : week} range={range} now={now} />
    </div>
  );
}
