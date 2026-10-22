"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChargeLevel } from "@/lib/charge-level";
import { cn } from "@/lib/utils";

// Same box as the loaded chart (panel + h-40), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted px-3 pt-4 pb-2">
      <div className="h-40 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./charge-level-plot"), { ssr: false, loading: Placeholder });

const DAY = 86_400_000;
const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

// Battery level over the last 7 or 30 days, with charging shaded. The switch is local: all 30 days
// arrive with the page.
export function ChargeLevelChart({ level, now }: { level: ChargeLevel | null; now: number }) {
  const [days, setDays] = useState(7);
  if (!level || level.points.length < 2) return null;
  const from = Math.max(level.from, now - days * DAY);
  const points = level.points.filter((p) => p.at >= from);
  const charging = level.charging.filter((c) => c.end > from).map((c) => ({ start: Math.max(c.start, from), end: c.end }));
  const latest = level.points[level.points.length - 1];
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Charge level</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{Math.round(latest.level)}%</p>
        <p className="text-sm text-muted-foreground">
          {charging.length > 0 ? `Last ${days} days, shaded while charging` : `Last ${days} days`}
        </p>
      </div>
      <div className="space-y-4">
        <div role="group" aria-label="Range" className="inline-flex border">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn("rounded-none", days === r.days && "bg-secondary text-foreground")}
            >
              {r.label}
            </Button>
          ))}
        </div>
        {points.length >= 2 ? (
          <Plot points={points} charging={charging} from={from} to={now} />
        ) : (
          <p className="text-sm text-muted-foreground">No readings in the last {days} days.</p>
        )}
      </div>
    </section>
  );
}
