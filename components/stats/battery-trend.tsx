"use client";

import dynamic from "next/dynamic";
import type { TrendPoint } from "./battery-trend-plot";

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
const Plot = dynamic(() => import("./battery-trend-plot"), { ssr: false, loading: Placeholder });

export function BatteryTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;
  return <Plot points={points} />;
}
