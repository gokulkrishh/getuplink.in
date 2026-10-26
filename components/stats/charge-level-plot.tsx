"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ChargeStretch, LevelPoint } from "@/lib/charge-level";
import { formatClock, formatShortDate } from "@/lib/format";
import { Measure } from "@/components/measure";

const config = { level: { label: "Battery level", color: "var(--chart-accent)" } } satisfies ChartConfig;

// Battery level on a fixed 0–100% axis, with a faint band behind each charge. Ticks are bare numbers
// with % titled above the axis; the margins leave room for the top tick and the last date.
export default function ChargeLevelPlot({ points, charging, from, to }: { points: LevelPoint[]; charging: ChargeStretch[]; from: number; to: number }) {
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

  const levels = points.map((p) => p.level);
  const low = Math.round(Math.min(...levels));
  const high = Math.round(Math.max(...levels));

  return (
    <div className="relative bg-muted dark:bg-card px-3 pt-6 pb-2">
      <span className="absolute top-1.5 left-3 font-mono text-xs text-faint" aria-hidden="true">
        %
      </span>
      <div
        ref={box}
        className="h-40 w-full"
        role="img"
        aria-label={`Battery level from ${formatShortDate(from)} to ${formatShortDate(to)}: between ${low}% and ${high}%, ${charging.length} ${charging.length === 1 ? "charge" : "charges"}.`}
      >
        {width === 0 ? (
          <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-40 w-full" initialDimension={{ width, height: 160 }}>
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="at"
                type="number"
                scale="time"
                domain={[from, to]}
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={48}
                tick={{ fontSize: 12, fill: "var(--faint)" }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                width={32}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={{ fontSize: 12, fill: "var(--faint)" }}
              />
              {charging.map((c) => (
                <ReferenceArea key={c.start} x1={c.start} x2={c.end} ifOverflow="hidden" fill="var(--charge)" fillOpacity={0.22} strokeOpacity={0} />
              ))}
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as LevelPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="border bg-background px-2 py-1 text-xs">
                      <span className="font-mono tabular-nums">
                        <Measure text={`${Math.round(point.level)}%`} />
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {formatShortDate(point.at)}, {formatClock(point.at)}
                      </span>
                    </div>
                  );
                }}
              />
              <Line dataKey="level" type="linear" stroke="var(--color-level)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-level)" }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
