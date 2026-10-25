"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { CurvePoint } from "@/lib/charge-curve";
import { formatClock } from "@/lib/format";
import { Measure } from "@/components/measure";

const config = {
  kw: { label: "Power", color: "var(--chart-accent)" },
  level: { label: "Battery", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const kwFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const tick = { fontSize: 11, fill: "var(--faint)" };

// Power in kW on the left axis and battery % on the right, against the time of day. Ticks are bare
// numbers with each axis's unit titled above it, so they stay on one line; the right axis leaves room
// for the last clock time.
export default function ChargeCurvePlot({ points }: { points: CurvePoint[] }) {
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

  const peak = Math.max(...points.map((p) => p.kw ?? 0));
  const levels = points.flatMap((p) => (p.level === null ? [] : [p.level]));
  const first = points[0];
  const last = points[points.length - 1];
  const levelText = levels.length ? `, battery ${Math.round(levels[0])}% to ${Math.round(levels[levels.length - 1])}%` : "";

  return (
    <div className="relative bg-muted dark:bg-card px-3 pt-6 pb-2">
      <span className="absolute top-1.5 left-3 font-mono text-xs text-faint" aria-hidden="true">
        kW
      </span>
      <span className="absolute top-1.5 right-3 font-mono text-xs text-faint" aria-hidden="true">
        %
      </span>
      <div
        ref={box}
        className="h-40 w-full"
        role="img"
        aria-label={`Charging power from ${formatClock(first.t)} to ${formatClock(last.t)}, up to ${kwFormat.format(peak)} kW${levelText}.`}
      >
        {width === 0 ? (
          <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-40 w-full" initialDimension={{ width, height: 160 }}>
            <LineChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatClock}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={48}
                tick={tick}
              />
              <YAxis
                yAxisId="kw"
                domain={[0, "auto"]}
                width={32}
                tickCount={3}
                tickFormatter={(v: number) => kwFormat.format(v)}
                tickLine={false} axisLine={{ stroke: "var(--border)" }}
                tick={tick}
              />
              <YAxis yAxisId="level" orientation="right" domain={[0, 100]} width={32} ticks={[0, 50, 100]} tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={tick} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as CurvePoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="border bg-background px-2 py-1 text-xs">
                      {point.kw !== null && (
                        <span className="font-mono tabular-nums">
                          <Measure text={`${kwFormat.format(point.kw)} kW`} />
                        </span>
                      )}
                      {point.level !== null && (
                        <span className="ml-2 font-mono tabular-nums">
                          <Measure text={`${Math.round(point.level)}%`} />
                        </span>
                      )}
                      <span className="ml-2 text-muted-foreground">{formatClock(point.t)}</span>
                    </div>
                  );
                }}
              />
              <Line yAxisId="level" dataKey="level" type="linear" stroke="var(--color-level)" strokeWidth={1.25} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-level)" }} connectNulls isAnimationActive={false} />
              <Line yAxisId="kw" dataKey="kw" type="linear" stroke="var(--color-kw)" strokeWidth={1.75} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-kw)" }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
