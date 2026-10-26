"use client";

import BatteryTrendPlot, { type TrendPoint } from "./battery-trend-plot";

// Usable capacity by week, as a line. Nothing with fewer than two weeks.
export function BatteryTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;
  return <BatteryTrendPlot points={points} />;
}
