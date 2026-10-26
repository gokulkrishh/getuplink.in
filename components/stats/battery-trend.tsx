"use client";

import BatteryTrendPlot, { type TrendPoint } from "./battery-trend-plot";

// The estimated full pack by week, as a line. Nothing with fewer than two weeks.
export function BatteryTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;
  return <BatteryTrendPlot points={points} />;
}
