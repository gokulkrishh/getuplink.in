"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Measure } from "@/components/measure";
import { withUnit } from "@/components/stats/bar-parts";
import { formatClock, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { evenStops, PLOT_FOCUS, plotKeys } from "@/components/stats/plot-keys";

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

// The colours a split trace can take, by meaning (see "Colour by meaning" in docs/charts.md), written out
// in full so Tailwind finds each class. `warm` is the amber of chart-worse (uphill, braking), `cool` the
// accent blue, `charge` the green of energy going into the battery (regen). Hard moments are marked in
// destructive red.
const TONES = {
  cool: { stroke: "stroke-chart-accent", fill: "fill-chart-accent/25", swatch: "bg-chart-accent" },
  warm: { stroke: "stroke-chart-worse", fill: "fill-chart-worse/30", swatch: "bg-chart-worse" },
  charge: { stroke: "stroke-charge", fill: "fill-charge/25", swatch: "bg-charge" },
} as const;
export type Tone = keyof typeof TONES;
// One side of a split trace: its colour, and the word that names its sign in the tooltip and the legend.
export type Side = { tone: Tone; words: string };

// Round clock times between the ends of a time axis, as many as fit at this width. The end labels sit flush
// with the plot's edges, so a centred label in between keeps one and a half labels clear of each end.
export function clockTicks(from: number, to: number, width: number): number[] {
  const step = width > 0 ? STEPS.find((s) => (s / (to - from)) * width >= LABEL_PX * 1.25) : undefined;
  const between: number[] = [];
  if (step) {
    for (let t = Math.ceil((from + IST) / step) * step - IST; t < to; t += step) {
      const px = ((t - from) / (to - from)) * width;
      if (px >= LABEL_PX * 1.5 && px <= width - LABEL_PX * 1.5) between.push(t);
    }
  }
  return between;
}

const PX_PER_POINT = 4;

// A long drive has a reading every second or so, far more than the plot has pixels: drawn as is, the line
// is a solid smear and the hover jumps between readings a pixel apart. So one reading per few pixels: in
// each slice of time, the one that reached furthest from zero (the hardest brake, the biggest regen), so
// peaks still show. Short drives, with room for every reading, are drawn whole.
export function thinned(points: Point[], from: number, to: number, width: number): Point[] {
  const slots = Math.max(60, Math.floor(width / PX_PER_POINT));
  if (points.length <= slots) return points;
  const slice = (to - from) / slots;
  const kept = new Map<number, Point>();
  for (const p of points) {
    const k = Math.min(slots - 1, Math.floor((p.t - from) / slice));
    const was = kept.get(k);
    if (!was || Math.abs(p.v) > Math.abs(was.v)) kept.set(k, p);
  }
  return [...kept.values()].sort((a, b) => a.t - b.t);
}

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
  split,
  marks,
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
  // Colour by meaning for a signed trace: the line above zero in one colour and below it in another, and
  // with `area`, the space between the line and zero shaded the same. The tooltip says the side in words
  // ("Regen 3.1 kW"), and a legend under the chart names both.
  split?: { above: Side; below: Side; area?: boolean };
  // Moments marked on the line, like hard starts and stops, with the legend's word for them.
  marks?: { points: Point[]; words: string };
}) {
  const clip = useId();
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

  const raw = points.filter((p) => p.t >= from && p.t <= to);
  if (raw.length < 2 || to <= from) return null;
  const shown = thinned(raw, from, to, width);
  // The axis and the summary for screen readers keep every reading's reach, not just the drawn ones.
  const vs = raw.map((p) => p.v);
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
  const x = (p: Point) => (xPct(p.t) * 10).toFixed(1);
  const xy = (p: Point) => `${x(p)},${yPct(p.v).toFixed(2)}`;
  const path = shown.map((p, k) => `${k === 0 || leg(p.t) !== leg(shown[k - 1].t) ? "M" : "L"}${xy(p)}`).join(" ");
  // The same runs closed down to the zero line, for the shaded area of a split trace.
  const zero = yPct(0).toFixed(2);
  const area = split?.area
    ? shown
        .map((p, k) => {
          const first = k === 0 || leg(p.t) !== leg(shown[k - 1].t);
          const last = k === shown.length - 1 || leg(p.t) !== leg(shown[k + 1].t);
          return `${first ? `M${x(p)},${zero} L` : "L"}${xy(p)}${last ? ` L${x(p)},${zero} Z` : ""}`;
        })
        .join(" ")
    : null;
  // A split line is drawn twice, each copy clipped to its side of zero.
  const sides = split ? ([["above", split.above, 0, yPct(0)], ["below", split.below, yPct(0), 100 - yPct(0)]] as const) : null;
  const toneAt = (v: number) => (split ? TONES[v < 0 ? split.below.tone : split.above.tone] : TONES.cool);

  const between = clockTicks(from, to, width);

  // Close enough to count: within 2% of the drive, so a stop says it has no reading.
  const near = at === null ? null : shown.reduce((a, p) => (Math.abs(p.t - at) < Math.abs(a.t - at) ? p : a));
  const hit = near && at !== null && Math.abs(near.t - at) <= (to - from) * 0.02 ? near : null;
  const cursor = hit?.t ?? at;
  const value = (v: number) => withUnit(formatNumber(v, digits), unit);
  // A split trace says the side in words, never by colour alone: "Regen 3.1 kW", "Uphill 2.0%".
  const words = (v: number) => (split && v !== 0 ? `${v < 0 ? split.below.words : split.above.words} ${value(Math.abs(v))}` : value(v));
  const pick = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setAt(from + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (to - from));
  };

  return (
    <div className="space-y-2">
      <div className="chart-touch relative rounded-lg bg-muted pt-8 pr-4 pb-2 pl-2 dark:bg-card">
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
            className={cn("relative h-28 min-w-0 flex-1 touch-pan-y", PLOT_FOCUS)}
            role="group"
            aria-label={`${label} from ${formatClock(from)} to ${formatClock(to)}, between ${axisNumber.format(Math.min(...vs))} and ${axisNumber.format(Math.max(...vs))} ${unit}`}
            {...plotKeys(at, setAt, evenStops(from, to))}
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
              {sides ? (
                sides.map(([name, side, y, h]) => (
                  <g key={name} clipPath={`url(#${clip}-${name})`}>
                    <clipPath id={`${clip}-${name}`}>
                      <rect x={0} y={y} width={1000} height={h} />
                    </clipPath>
                    {area && <path d={area} className={TONES[side.tone].fill} stroke="none" />}
                    <path d={path} fill="none" className={TONES[side.tone].stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  </g>
                ))
              ) : (
                <path d={path} fill="none" className="stroke-chart-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              )}
            </svg>
            {marks?.points
              .filter((p) => p.t >= from && p.t <= to)
              .map((p) => (
                <div
                  key={p.t}
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive ring-2 ring-background"
                  style={{ left: `${xPct(p.t)}%`, top: `${yPct(p.v)}%` }}
                  aria-hidden="true"
                />
              ))}
            {cursor !== null && (
              <>
                <span role="status" className="sr-only">
                  {formatClock(cursor)}: {hit ? words(hit.v) : "no data here"}
                </span>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground" style={{ left: `${xPct(cursor)}%` }} aria-hidden="true" />
                {hit && (
                  <div
                    className={cn("pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", toneAt(hit.v).swatch)}
                    style={{ left: `${xPct(hit.t)}%`, top: `${yPct(hit.v)}%` }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="pointer-events-none absolute top-0 z-10 rounded-md border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
                  style={{ left: `${xPct(cursor)}%`, transform: `translateX(${xPct(cursor) > 50 ? "calc(-100% - 8px)" : "8px"})` }}
                  aria-hidden="true"
                >
                  <span className="block text-muted-foreground">{formatClock(cursor)}</span>
                  <span className="block font-mono">{hit ? <Measure text={words(hit.v)} /> : <span className="font-sans text-muted-foreground">No data here</span>}</span>
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
      {(split || marks) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {split &&
            [split.above, split.below].map((side) => (
              <li key={side.words} className="inline-flex items-center gap-1.5">
                <span className={cn("h-0.5 w-3", TONES[side.tone].swatch)} aria-hidden="true" />
                {side.words}
              </li>
            ))}
          {marks && (
            <li className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
              {marks.words}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
