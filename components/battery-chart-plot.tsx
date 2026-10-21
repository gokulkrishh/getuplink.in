"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { LevelPoint } from "@/lib/dashboard-summary";
import { formatClock, formatShortDate } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

const config = { level: { label: "Battery", color: "var(--foreground)" } } satisfies ChartConfig;

const HOUR = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR;
const hourOnly = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true });

// Ticks every 6 hours (IST clock) for 24 h, and at each IST midnight for 7 days.
function ticksFor(range: "day" | "week", from: number, now: number): number[] {
  const ticks: number[] = [];
  if (range === "day") {
    const step = 6 * HOUR;
    for (let t = Math.ceil((from + IST_OFFSET_MS) / step) * step - IST_OFFSET_MS; t <= now; t += step) ticks.push(t);
  } else {
    for (let day = istDay(from) + 1; istDayStart(day) <= now; day++) ticks.push(istDayStart(day));
  }
  return ticks;
}

// A quiet line of battery level on a 0 to 100 axis, with a hover readout like the version chart.
export default function BatteryChartPlot({ points, range, now }: { points: LevelPoint[]; range: "day" | "week"; now: number }) {
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

  const from = now - (range === "day" ? 24 : 7 * 24) * HOUR;
  const ticks = useMemo(() => ticksFor(range, from, now), [range, from, now]);
  // The line runs on to now at the last known level.
  const data = useMemo(() => {
    const last = points.at(-1);
    return last && last.at < now ? [...points, { ...last, at: now }] : points;
  }, [points, now]);

  return (
    <div className="bg-muted px-3 pt-4 pb-2">
      <div ref={box} className="h-28 w-full">
        {width === 0 ? (
          <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-28 w-full" initialDimension={{ width, height: 112 }}>
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="at"
                type="number"
                scale="time"
                domain={[from, now]}
                ticks={ticks}
                tickFormatter={(t: number) => (range === "day" ? hourOnly.format(t) : formatShortDate(t))}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval="preserveStartEnd"
                minTickGap={16}
                tick={{ fontSize: 11, fill: "var(--faint)" }}
              />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} width={36} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--faint)" }} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as LevelPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="border bg-background px-2 py-1 text-xs">
                      <span className="font-mono tabular-nums">
                        {range === "week" && `${formatShortDate(point.at)}, `}
                        {formatClock(point.at)} · {Math.round(point.level)}%
                      </span>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="level"
                type="monotone"
                stroke="var(--color-level)"
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-level)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
