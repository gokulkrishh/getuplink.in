"use client";

import dynamic from "next/dynamic";
import type { CurvePoint } from "@/lib/charge-curve";
import { unitNotes } from "./chart-caption";

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
const Plot = dynamic(() => import("./charge-curve-plot"), { ssr: false, loading: Placeholder });

const SERIES = [
  { label: "Power", className: "bg-chart-accent" },
  { label: "Battery", className: "bg-muted-foreground" },
];

export function ChargeCurve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return null;
  return (
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
      <p className="text-xs text-muted-foreground">
        Through this charge, by time of day: charging power in kW on the left scale, and battery level from 0 to 100% on the right. {unitNotes(["kW"])}
      </p>
    </div>
  );
}
