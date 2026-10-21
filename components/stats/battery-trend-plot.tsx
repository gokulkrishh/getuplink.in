"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatShortDate } from "@/lib/format";

const config = { kwh: { label: "Estimated full pack", color: "var(--foreground)" } } satisfies ChartConfig;

export type TrendPoint = { weekStart: number; kwh: number };

// Weekly median of the estimated full pack. The axis hugs the data (±2 kWh) instead of starting at 0,
// since the pack moves by tenths of a kWh.
export default function BatteryTrendPlot({ points }: { points: TrendPoint[] }) {
  // Measure the box first and draw at that width, so the chart never renders at a default size and jumps.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const domain = useMemo<[number, number]>(() => {
    const values = points.map((p) => p.kwh);
    return [Math.floor(Math.min(...values) - 2), Math.ceil(Math.max(...values) + 2)];
  }, [points]);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="bg-muted px-3 pt-4 pb-2">
      <div
        ref={box}
        className="h-40 w-full"
        role="img"
        aria-label={`Estimated full pack per week: ${first.kwh.toFixed(1)} kWh in the week of ${formatShortDate(first.weekStart)}, ${last.kwh.toFixed(1)} kWh in the week of ${formatShortDate(last.weekStart)}.`}
      >
        {width === 0 ? (
          <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-40 w-full" initialDimension={{ width, height: 160 }}>
            <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="weekStart"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tick={{ fontSize: 11, fill: "var(--faint)" }}
              />
              <YAxis domain={domain} width={36} tickCount={3} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--faint)" }} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="border bg-background px-2 py-1 text-xs">
                      <span className="font-mono tabular-nums">{point.kwh.toFixed(1)} kWh</span>
                      <span className="ml-2 text-muted-foreground">Week of {formatShortDate(point.weekStart)}</span>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="kwh"
                type="monotone"
                stroke="var(--color-kwh)"
                strokeWidth={1.75}
                dot={{ r: 2, strokeWidth: 0, fill: "var(--color-kwh)" }}
                activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-kwh)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
