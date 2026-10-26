"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Measure } from "@/components/measure";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

type Point = { t: number; v: number };

const MIN = 60_000;
const IST = 330 * MIN; // clock ticks fall on round IST minutes, like formatClock
const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 360].map((m) => m * MIN);
const LABEL_PX = 64; // room one clock label ("10:04 PM") needs, with a gap
// The y-axis end: the data's reach rounded up to a step finer than the bar charts' niceMax, so a 54 kW
// peak tops out at 60, not 100.
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceTop(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return (NICE.find((m) => value <= m * step) ?? 10) * step;
}
const axisNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

// One measure streamed during a drive (speed, power, …) over the drive's own time, `from` to `to`, in the
// chart panel: a y axis with its unit above it, the line, and clock times along the bottom. Every trace on a
// page shares `from` and `to` and the same gutter, so their time axes line up when stacked. The axes are
// HTML, so their text stays the same size on a phone and a desktop; the SVG draws only the line, stretched
// to the plot. The line breaks between `legs` (the stops of a trip), as there are no readings there.
// Hover, tap or drag for the time and value of the nearest reading; a vertical swipe still scrolls the page,
// and a tap elsewhere hides it. Never wider than its column, so it never scrolls sideways.
export function DriveTrace({
  label,
  points,
  from,
  to,
  unit,
  signed = false,
  max,
  digits = 0,
  legs,
}: {
  // "Speed", for screen readers.
  label: string;
  points: Point[];
  from: number;
  to: number;
  unit: string;
  // Values either side of zero (power, acceleration, grade): a solid zero line, the axis reaching below it.
  signed?: boolean;
  // A fixed top, like 100 for battery %.
  max?: number;
  // Decimals in the tooltip.
  digits?: number;
  legs?: { start: number; end: number }[];
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (at === null) return;
    const away = (e: PointerEvent) => {
      if (!plot.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [at]);

  const shown = points.filter((p) => p.t >= from && p.t <= to);
  if (shown.length < 2 || to <= from) return null;
  const vs = shown.map((p) => p.v);
  const top = Math.max(0, ...vs);
  const bottom = Math.min(0, ...vs);
  const hi = max ?? (top > 0 ? niceTop(top) : signed ? 0 : 1);
  const lo = signed && bottom < 0 ? -niceTop(-bottom) : 0;
  const span = hi - lo || 1;
  const ticks = lo < 0 && hi > 0 ? [hi, 0, lo] : lo < 0 ? [0, lo / 2, lo] : [hi, hi / 2, 0];
  const xPct = (t: number) => ((t - from) / (to - from)) * 100;
  const yPct = (v: number) => ((hi - v) / span) * 100;

  // One subpath per leg, so a stop between legs is a gap and not a made-up straight line.
  const leg = (t: number) => legs?.findIndex((l) => t >= l.start && t <= l.end) ?? 0;
  const path = shown
    .map((p, k) => `${k === 0 || leg(p.t) !== leg(shown[k - 1].t) ? "M" : "L"}${(xPct(p.t) * 10).toFixed(1)},${yPct(p.v).toFixed(2)}`)
    .join(" ");

  // Round clock times between the ends, as many as fit at this width. The end labels sit flush with the
  // plot's edges, so a centred label in between keeps one and a half labels clear of each end.
  const step = width > 0 ? STEPS.find((s) => (s / (to - from)) * width >= LABEL_PX * 1.25) : undefined;
  const between: number[] = [];
  if (step) {
    for (let t = Math.ceil((from + IST) / step) * step - IST; t < to; t += step) {
      const px = (xPct(t) / 100) * width;
      if (px >= LABEL_PX * 1.5 && px <= width - LABEL_PX * 1.5) between.push(t);
    }
  }

  // Close enough to count: within 2% of the drive, so a stop says it has no reading.
  const near = at === null ? null : shown.reduce((a, p) => (Math.abs(p.t - at) < Math.abs(a.t - at) ? p : a));
  const hit = near && at !== null && Math.abs(near.t - at) <= (to - from) * 0.02 ? near : null;
  const cursor = hit?.t ?? at;
  const value = (v: number) => `${v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
  const pick = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setAt(from + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (to - from));
  };

  return (
    <div className="chart-touch relative bg-muted pt-8 pr-4 pb-2 pl-2 dark:bg-card">
      <span className="absolute top-1.5 left-2 font-mono text-xs text-faint" aria-hidden="true">
        {unit}
      </span>
      <div className="flex gap-2">
        <div className="relative h-28 w-8 shrink-0 text-right font-mono text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(v)}%` }}>
              {axisNumber.format(v)}
            </span>
          ))}
        </div>
        <div
          ref={plot}
          className="relative h-28 min-w-0 flex-1 touch-pan-y"
          role="img"
          aria-label={`${label} from ${formatClock(from)} to ${formatClock(to)}, between ${axisNumber.format(Math.min(...vs))} and ${axisNumber.format(Math.max(...vs))} ${unit}`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
        >
          {ticks.map((v) => (
            <div
              key={v}
              className={cn("absolute inset-x-0 border-t", v === 0 ? "border-muted-foreground/40" : "border-dashed border-border")}
              style={{ top: `${yPct(v)}%` }}
              aria-hidden="true"
            />
          ))}
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d={path} fill="none" className="stroke-chart-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {cursor !== null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground" style={{ left: `${xPct(cursor)}%` }} aria-hidden="true" />
              {hit && (
                <div
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-accent ring-2 ring-background"
                  style={{ left: `${xPct(hit.t)}%`, top: `${yPct(hit.v)}%` }}
                  aria-hidden="true"
                />
              )}
              <div
                className="pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
                style={{ left: `${xPct(cursor)}%`, transform: `translateX(${xPct(cursor) > 50 ? "calc(-100% - 8px)" : "8px"})` }}
                aria-live="polite"
              >
                <span className="block text-muted-foreground">{formatClock(cursor)}</span>
                <span className="block font-mono">{hit ? <Measure text={value(hit.v)} /> : <span className="font-sans text-muted-foreground">No reading here</span>}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="relative mt-2 ml-10 h-4 text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
        <span className="absolute left-0">{formatClock(from)}</span>
        {between.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${xPct(t)}%` }}>
            {formatClock(t)}
          </span>
        ))}
        <span className="absolute right-0">{formatClock(to)}</span>
      </div>
    </div>
  );
}
