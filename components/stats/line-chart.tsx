"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Measure } from "@/components/measure";

export type Series = { name: string; className: string; points: { x: number; y: number }[] };

const axisNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const CHAR_PX = 7; // a 12px axis character, roughly, to fit the x labels without measuring each

// One or more lines over a shared x axis (time, battery %, odometer), in the chart panel. The axes are HTML,
// after DriveTrace, so their text stays 12px on a phone and a desktop; the SVG draws only the lines, stretched
// to the plot. With `unit`, the y axis has bare numbers and the unit once above it; without, each tick is
// `formatY`'s text. With `gap`, a line breaks where readings are further apart than that, rather than drawing
// a straight line across a time with no readings. Hover or tap anywhere for a tooltip with each line's value
// at that x, and a dot on each line. A line with no reading near that x is left out of the tooltip rather than
// showing a far-off value. On a touch screen a vertical swipe still scrolls the page, and a tap elsewhere
// hides the tooltip. Never wider than its column, so it never scrolls sideways.
export function LineChart({
  series,
  formatX,
  formatY,
  formatTickX = formatX,
  label,
  unit,
  yFrom,
  yTo,
  signed = false,
  gap,
  caption,
}: {
  series: Series[];
  // The x and y of a reading in the tooltip ("26 Oct, 10:04 PM", "31 °C").
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  // A shorter x for the axis ("26 Oct"), when the tooltip's is long.
  formatTickX?: (x: number) => string;
  label: string;
  // Like "°C" or "kWh": drawn once above the y axis, which then shows bare numbers.
  unit?: string;
  // Plain words under the chart (and its legend). Inside a ChartCard, use its caption instead.
  caption?: string;
  // Start the y axis here instead of at the data's lowest value (0 for most).
  yFrom?: number;
  // End the y axis here instead of a little above the data's highest value.
  yTo?: number;
  // Centre the y axis on zero (power, grade).
  signed?: boolean;
  // Break a line where two readings are further apart than this, in x units.
  gap?: number;
}) {
  const [at, setAt] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const plot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  // A tap elsewhere hides the tooltip (touch has no pointer leaving).
  useEffect(() => {
    if (at === null) return;
    const away = (e: PointerEvent) => {
      if (!plot.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [at]);
  const drawn = series.filter((s) => s.points.length >= 2);
  if (drawn.length === 0) return null;
  const xs = drawn.flatMap((s) => s.points.map((p) => p.x));
  const ys = drawn.flatMap((s) => s.points.map((p) => p.y));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const reach = Math.max(...ys.map(Math.abs)) * 1.1 || 1;
  const low = signed ? -reach : (yFrom ?? Math.min(...ys));
  const high = signed ? reach : (yTo ?? Math.max(...ys) + (Math.max(...ys) - low) * 0.1);
  // A flat line (the same value every week) gets 1 either side, so it sits in the middle with three ticks.
  const flat = high <= low;
  const lo = flat ? low - 1 : low;
  const hi = flat ? low + 1 : high;
  const xPct = (v: number) => ((v - x0) / (x1 - x0 || 1)) * 100;
  const yPct = (v: number) => ((hi - v) / (hi - lo || 1)) * 100;
  const nearest = (s: Series, v: number) => s.points.reduce((a, p) => (Math.abs(p.x - v) < Math.abs(a.x - v) ? p : a));
  // Close enough to count: within 3% of the chart's span, or half the usual step between readings when
  // they're sparser than that (one a week), so a tap between two weekly points picks the nearer. Never more
  // than half a gap, so a tap in a break says there's no reading rather than showing one from hours away.
  const steps = drawn.flatMap((s) => s.points.slice(1).map((p, k) => p.x - s.points[k].x)).sort((a, b) => a - b);
  const usual = steps[Math.floor(steps.length / 2)] ?? 0;
  const reachX = Math.min(Math.max((x1 - x0) * 0.03, usual / 2), gap !== undefined ? gap / 2 : Infinity);
  const pick = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setAt(x0 + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (x1 - x0));
  };
  const hits =
    at === null
      ? []
      : drawn.flatMap((s) => {
          const p = nearest(s, at);
          return Math.abs(p.x - at) <= reachX ? [{ s, p }] : [];
        });
  const cursor = hits[0]?.p.x ?? at;
  const ticks = signed ? [hi, 0, lo] : [hi, (lo + hi) / 2, lo];
  const tick = (v: number) => (unit ? axisNumber.format(v) : formatY(v));
  // The widest tick sets the gutter, so a long one ("1,200 kWh") never runs into the plot.
  const widest = ticks.map(tick).reduce((a, t) => (t.length > a.length ? t : a), "");
  const path = (s: Series) =>
    s.points
      .map((p, k) => `${k === 0 || (gap !== undefined && p.x - s.points[k - 1].x > gap) ? "M" : "L"}${(xPct(p.x) * 10).toFixed(1)},${yPct(p.y).toFixed(2)}`)
      .join(" ");

  // Evenly spaced x labels between the ends, as many as fit at this width without colliding. The end
  // labels sit flush with the plot's edges, so each part is wider than one and a half labels: a centred
  // label between keeps clear of an end label's whole width. Hidden copies measure 0 and show only the ends.
  const labelPx = Math.max(formatTickX(x0).length, formatTickX(x1).length) * CHAR_PX + 16;
  // Each one sits on a real reading's x, so a weekly chart labels real weeks, and any that would crowd an
  // end or each other is dropped.
  const between: number[] = [];
  const parts = width > 0 ? Math.min(4, Math.floor(width / (labelPx * 1.6))) : 0;
  const px = (v: number) => (xPct(v) / 100) * width;
  for (let k = 1; k < parts; k++) {
    const want = x0 + ((x1 - x0) * k) / parts;
    const v = xs.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    const clear = px(v) >= labelPx * 1.5 && px(v) <= width - labelPx * 1.5 && between.every((b) => Math.abs(px(b) - px(v)) >= labelPx * 1.25);
    if (clear) between.push(v);
  }

  return (
    <div className="space-y-2">
      <div className="chart-touch relative bg-muted pt-8 pr-4 pb-2 pl-2 dark:bg-card">
        {unit && (
          <span className="absolute top-1.5 left-2 font-mono text-xs text-faint" aria-hidden="true">
            {unit}
          </span>
        )}
        <div className="flex gap-2">
          <div className="relative h-28 shrink-0 text-right font-mono text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
            {/* Invisible, it gives the gutter the widest tick's width. */}
            <span className="invisible block h-0 min-w-8">{widest}</span>
            {ticks.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(v)}%` }}>
                {tick(v)}
              </span>
            ))}
          </div>
          <div
            ref={plot}
            className="relative h-28 min-w-0 flex-1 touch-pan-y"
            role="img"
            aria-label={label}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
          >
            {ticks.map((v) => (
              <div
                key={v}
                className={cn("absolute inset-x-0 border-t", signed && v === 0 ? "border-muted-foreground/40" : "border-dashed border-border")}
                style={{ top: `${yPct(v)}%` }}
                aria-hidden="true"
              />
            ))}
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              {drawn.map((s) => (
                <path key={s.name} d={path(s)} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className={s.className} />
              ))}
            </svg>
            {cursor !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground" style={{ left: `${xPct(cursor)}%` }} aria-hidden="true" />
                {hits.map(({ s, p }) => (
                  <svg
                    key={s.name}
                    viewBox="0 0 10 10"
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 overflow-visible"
                    style={{ left: `${xPct(p.x)}%`, top: `${yPct(p.y)}%` }}
                    aria-hidden="true"
                  >
                    <circle cx={5} cy={5} r={3.5} strokeWidth={2} className={cn(s.className, "fill-background")} />
                  </svg>
                ))}
                <div
                  className="pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
                  style={{ left: `${xPct(cursor)}%`, transform: `translateX(${xPct(cursor) > 50 ? "calc(-100% - 8px)" : "8px"})` }}
                  aria-live="polite"
                >
                  <span className="block text-muted-foreground">{formatX(cursor)}</span>
                  {hits.length === 0 ? (
                    <span className="block text-muted-foreground">No reading here</span>
                  ) : (
                    hits.map(({ s, p }) => (
                      <span key={s.name} className="flex items-center gap-1.5 font-mono">
                        {drawn.length > 1 && (
                          <svg viewBox="0 0 10 2" className="h-0.5 w-3" aria-hidden="true">
                            <line x1="0" y1="1" x2="10" y2="1" strokeWidth="2" className={s.className} />
                          </svg>
                        )}
                        {drawn.length > 1 && <span className="font-sans text-muted-foreground">{s.name}</span>}
                        <span>
                          <Measure text={formatY(p.y)} />
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {/* Lined up under the plot: the gutter's width plus the gap. */}
        <div className="mt-2 flex gap-2" aria-hidden="true">
          <span className="invisible h-0 min-w-8 shrink-0 font-mono text-xs whitespace-nowrap">{widest}</span>
          <div className="relative h-4 min-w-0 flex-1 text-xs whitespace-nowrap text-faint tabular-nums">
            <span className="absolute left-0">{formatTickX(x0)}</span>
            {between.map((v) => (
              <span key={v} className="absolute -translate-x-1/2" style={{ left: `${xPct(v)}%` }}>
                {formatTickX(v)}
              </span>
            ))}
            <span className="absolute right-0">{formatTickX(x1)}</span>
          </div>
        </div>
      </div>
      {drawn.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {drawn.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 10 2" className="h-0.5 w-3" aria-hidden="true">
                <line x1="0" y1="1" x2="10" y2="1" strokeWidth="2" className={cn(s.className)} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {caption && <p className="text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
