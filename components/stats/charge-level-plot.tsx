"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ChargeStretch, LevelPoint } from "@/lib/charge-level";
import { formatClock, formatLevels, formatPercent, formatShortDate } from "@/lib/format";
import { Measure } from "@/components/measure";
import { FloatTip, useActiveMark } from "@/components/stats/float-tip";
import { cn } from "@/lib/utils";

// A charge as drawn: its clipped span and its tip's words (see chargeTip).
export type ChargeBand = ChargeStretch & { tip: string };

const DAY = 86_400_000;
const MIN_BAND_PX = 3;
const HIT_PX = 16;
// The charging green behind the line; the legend's swatch uses the same (bg-charge/40).
const BAND_OPACITY = 0.4;

const config = { level: { label: "Battery level", color: "var(--chart-accent)" } } satisfies ChartConfig;

// Battery level on a fixed 0–100% axis, with a faint band behind each charge. Ticks are bare numbers
// with % titled above the axis; the margins leave room for the top tick and the last date.
export default function ChargeLevelPlot({ points, charging, from, to }: { points: LevelPoint[]; charging: ChargeBand[]; from: number; to: number }) {
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
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const panel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useActiveMark<number>(panel);

  // The plot sits between the y axis (32px) and the right margin (16px), above the x axis (30px). A charge
  // is drawn at least MIN_BAND_PX wide, so a half-hour charge still shows on a month, and its tap target
  // at least HIT_PX.
  const plotWidth = Math.max(1, width - 32 - 16);
  const msPerPx = (to - from) / plotWidth;
  const bands = charging.map((c) => {
    const grow = Math.max(0, MIN_BAND_PX * msPerPx - (c.end - c.start)) / 2;
    const x1 = Math.max(from, c.start - grow);
    const x2 = Math.min(to, Math.max(c.end + grow, x1 + MIN_BAND_PX * msPerPx));
    return { ...c, x1, x2 };
  });
  const px = (t: number) => 32 + ((t - from) / (to - from || 1)) * plotWidth;
  // Up to two days across, the ticks are times ("9 AM"); a date would repeat along the axis.
  const tick = to - from <= 2 * DAY ? formatClock : formatShortDate;

  return (
    <div ref={panel} className="relative rounded-lg bg-muted dark:bg-card px-3 pt-6 pb-2" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      <span className="absolute top-1.5 left-3 font-mono text-xs text-faint" aria-hidden="true">
        %
      </span>
      <div
        ref={box}
        className="h-40 w-full"
        role="img"
        aria-label={`Battery level from ${formatShortDate(from)} to ${formatShortDate(to)}: between ${formatLevels(low, high)}, ${charging.length} ${charging.length === 1 ? "charge" : "charges"}.`}
      >
        {width === 0 ? (
          <div className="h-full w-full rounded-md bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-40 w-full" initialDimension={{ width, height: 160 }}>
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="at"
                type="number"
                scale="time"
                domain={[from, to]}
                tickFormatter={tick}
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
              {bands.map((c, k) => (
                <ReferenceArea key={c.start} x1={c.x1} x2={c.x2} ifOverflow="hidden" fill="var(--charge)" fillOpacity={active?.key === k ? 0.6 : BAND_OPACITY} strokeOpacity={0} />
              ))}
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as LevelPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <div className="rounded-md border bg-background px-2 py-1 text-xs">
                      <span className="font-mono tabular-nums">
                        <Measure text={formatPercent(point.level)} />
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
      {/* Over the plot, outside the role="img" box so screen readers reach them: one target per charge,
          which names it in a tip. Elsewhere the line's own tip shows. */}
      {width > 0 && bands.length > 0 && (
        <div className="pointer-events-none absolute inset-x-3 top-6 h-[130px]">
          {bands.map((c, k) => {
            const left = px(c.x1);
            const w = px(c.x2) - left;
            const hit = Math.max(w, HIT_PX);
            // A narrow band takes its full height; a wide one (an overnight charge on a day) only a strip along
            // the bottom, so the line's own tip still shows above it.
            return (
              <button
                key={c.start}
                type="button"
                aria-label={c.tip}
                className={cn(
                  "pointer-events-auto absolute bottom-0 cursor-default outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring",
                  w > HIT_PX ? "h-4" : "top-2",
                )}
                style={{ left: left - (hit - w) / 2, width: hit }}
                onPointerEnter={(e) => e.pointerType === "mouse" && setActive({ key: k, el: e.currentTarget })}
                onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
                onFocus={(e) => setActive({ key: k, el: e.currentTarget })}
                onBlur={() => setActive(null)}
                onClick={(e) => setActive({ key: k, el: e.currentTarget })}
              />
            );
          })}
        </div>
      )}
      {active && bands[active.key] && (
        <FloatTip anchor={active.el}>
          <Measure text={bands[active.key].tip} />
        </FloatTip>
      )}
    </div>
  );
}
