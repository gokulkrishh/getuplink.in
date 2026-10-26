"use client";

import { LineChart } from "@/components/stats/line-chart";
import { formatKwh, formatShortDate } from "@/lib/format";

export type TrendPoint = { weekStart: number; kwh: number };


// Usable capacity per week (see weeklyUsable). The axis hugs the data (2 kWh either side) instead of starting
// at 0, since the pack moves by tenths of a kWh. Client-side, so the formatters never cross from the server.
export default function BatteryTrendPlot({ points }: { points: TrendPoint[] }) {
  const values = points.map((p) => p.kwh);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <LineChart
      series={[{ name: "Usable capacity", className: "stroke-chart-accent", points: points.map((p) => ({ x: p.weekStart, y: p.kwh })) }]}
      formatX={(x) => `Week of ${formatShortDate(x)}`}
      formatTickX={formatShortDate}
      formatY={(y) => formatKwh(y)}
      unit="kWh"
      yFrom={Math.floor(Math.min(...values) - 2)}
      yTo={Math.ceil(Math.max(...values) + 2)}
      label={`Usable capacity per week: ${formatKwh(first.kwh)} in the week of ${formatShortDate(first.weekStart)}, ${formatKwh(last.kwh)} in the week of ${formatShortDate(last.weekStart)}`}
    />
  );
}
