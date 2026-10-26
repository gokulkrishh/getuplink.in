"use client";

import dynamic from "next/dynamic";
import { ChartCard } from "@/components/chart-card";
import type { CurvePoint } from "@/lib/charge-curve";

// Same box as the loaded chart (panel + h-40), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted dark:bg-card px-3 pt-4 pb-2">
      <div className="h-40 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./charge-curve-plot"), { ssr: false, loading: Placeholder });

const SERIES = [
  { label: "Power", className: "bg-chart-accent" },
  { label: "Battery", className: "bg-muted-foreground" },
];

// Power and battery level through one charge. The page renders this only with two points or more, and
// explains kWh and AC or DC under its Session tiles.
export function ChargeCurve({ points }: { points: CurvePoint[] }) {
  return (
    <ChartCard
      title="Power and battery"
      description="Charging power and battery level through the charge."
      unit="kW"
    >
      <div className="space-y-3">
        <Plot points={points} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={`size-2 ${s.className}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
