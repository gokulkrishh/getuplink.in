"use client";

import { LineChart, type Series } from "@/components/stats/line-chart";
import { formatKwh, formatShortDate } from "@/lib/format";

export type TrendPoint = { weekStart: number; kwh: number };

const line = (points: TrendPoint[]) => points.map((p) => ({ x: p.weekStart, y: p.kwh }));
const span = (name: string, points: TrendPoint[]) =>
  `${name}: ${formatKwh(points[0].kwh)} in the week of ${formatShortDate(points[0].weekStart)}, ${formatKwh(points.at(-1)!.kwh)} in the week of ${formatShortDate(points.at(-1)!.weekStart)}`;

// Usable capacity per week (see weeklyUsable), and Tesla's own full-pack figure per week as a second line
// when it has two weeks. Whenever Tesla's line is drawn, even alone, the legend and tooltip name the lines,
// so Tesla's figure is never read as usable capacity.
// The axis hugs the data (2 kWh either side, rounded out to round ticks) instead of starting at 0, since
// the pack moves by tenths of a kWh. Client-side, so the formatters never cross from the server.
export default function BatteryTrendPlot({ usable, tesla }: { usable: TrendPoint[]; tesla: TrendPoint[] }) {
  const drawn = [
    { name: "Usable capacity", points: usable, className: "stroke-chart-accent" },
    { name: "Tesla's figure", points: tesla, className: "stroke-muted-foreground" },
  ].filter((s) => s.points.length >= 2);
  if (drawn.length === 0) return null;
  const values = drawn.flatMap((s) => s.points.map((p) => p.kwh));
  const series: Series[] = drawn.map((s) => ({ name: s.name, className: s.className, points: line(s.points) }));
  return (
    <LineChart
      series={series}
      formatX={(x) => `Week of ${formatShortDate(x)}`}
      formatTickX={formatShortDate}
      formatY={(y) => formatKwh(y)}
      unit="kWh"
      yFrom={Math.floor(Math.min(...values) - 2)}
      yTo={Math.ceil(Math.max(...values) + 2)}
      named={drawn.some((s) => s.name === "Tesla's figure")}
      label={`Battery health by week. ${drawn.map((s) => span(s.name, s.points)).join(". ")}`}
    />
  );
}
