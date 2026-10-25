"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatDate, formatShortDate } from "@/lib/format";

const config = { step: { label: "Version", color: "var(--chart-accent)" } } satisfies ChartConfig;

type Point = { at: number; step: number; version: string };

// A quiet step line: each rise is a new version, the last segment runs to the latest check.
export default function VersionChartPlot({
  changes,
  until,
}: {
  changes: { version: string; detected_at: string }[];
  until: string | null;
}) {
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

  const data = useMemo(() => {
    const points: Point[] = changes.map((c, i) => ({ at: new Date(c.detected_at).getTime(), step: i, version: c.version }));
    const last = points.at(-1);
    if (last && until) points.push({ ...last, at: Math.max(new Date(until).getTime(), last.at) });
    return points;
  }, [changes, until]);
  if (data.length === 0) return null;

  return (
    // A soft panel behind the chart; the inner box is measured so the chart draws at its real width.
    <div className="bg-muted dark:bg-card px-3 pt-4 pb-2">
    <div ref={box} className="h-20 w-full">
      {width === 0 ? (
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      ) : (
    <ChartContainer config={config} className="aspect-auto h-20 w-full" initialDimension={{ width, height: 80 }}>
      <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
        <XAxis
          dataKey="at"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={formatShortDate}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={48}
          tick={{ fontSize: 11, fill: "var(--faint)" }}
        />
        {/* The first and latest versions label the y axis; the steps between are one update each. */}
        <YAxis
          domain={[-0.5, "dataMax + 0.5"]}
          ticks={[...new Set([0, data.at(-1)!.step])]}
          tickFormatter={(step: number) => data.find((p) => p.step === step)?.version ?? ""}
          width={84}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fontSize: 11, fill: "var(--faint)", fontFamily: "var(--font-mono)" }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload }) => {
            const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
            if (!point) return null;
            return (
              <div className="border bg-background px-2 py-1 text-xs">
                <span className="font-mono">{point.version}</span>
                <span className="ml-2 text-muted-foreground">{formatDate(point.at)}</span>
              </div>
            );
          }}
        />
        <Line
          dataKey="step"
          type="stepAfter"
          stroke="var(--color-step)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-step)" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
      )}
    </div>
    </div>
  );
}
