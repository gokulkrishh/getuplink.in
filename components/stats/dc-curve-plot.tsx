"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Measure } from "@/components/measure";
import { formatKw, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CurveSeries = { name: string; stroke: string; swatch: string; points: { x: number; y: number }[] };

const LABEL_PX = 44; // room one battery label ("100%") needs, with a gap
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceTop(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return (NICE.find((m) => value <= m * step) ?? 10) * step;
}
const axisNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Where the tooltip's left edge goes, in px from the plot's left: beside the cursor on the right, else on
// its left, else as far over as keeps it inside the panel (the y-axis gutter is 40px, the right padding 16px).
function tipLeft(cursor: number, tip: number, plot: number): number {
  if (cursor + 8 + tip <= plot + 16) return cursor + 8;
  if (cursor - 8 - tip >= -40) return cursor - 8 - tip;
  return Math.max(-40, plot + 16 - tip);
}

// Charging power in kW against battery level, one line per kind of DC charger, each point the middle value
// of a `band`-wide step of battery % (the point sits at the step's centre). Same geometry as DriveTrace:
// HTML axes, so their text stays 12px on a phone, and an SVG stretched to the plot that draws only the
// lines. The x axis spans the data's own steps, not 0 to 100%. A line breaks where a step has no charges,
// rather than drawing across it. Hover, tap or drag for each line's value in that step; a line with nothing
// there says "No reading here". A vertical swipe still scrolls the page, and a tap elsewhere hides it.
export function DcCurvePlot({ series, band, label }: { series: CurveSeries[]; band: number; label: string }) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState<number | null>(null);
  // The tooltip's own width, so it can sit beside the cursor and still stay inside the panel on a phone.
  const tip = useRef<HTMLDivElement>(null);
  const [tipWidth, setTipWidth] = useState(0);
  useLayoutEffect(() => {
    if (at !== null && tip.current) setTipWidth(tip.current.offsetWidth);
  }, [at]);
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

  const drawn = series.filter((s) => s.points.length > 0);
  if (drawn.length === 0) return null;
  // The span covers whole steps: from the bottom of the lowest to the top of the highest.
  const xs = drawn.flatMap((s) => s.points.map((p) => p.x));
  const from = Math.min(...xs) - band / 2;
  const to = Math.max(...xs) + band / 2;
  const hi = niceTop(Math.max(1, ...drawn.flatMap((s) => s.points.map((p) => p.y))));
  const ticks = [hi, hi / 2, 0];
  const xPct = (x: number) => ((x - from) / (to - from)) * 100;
  const yPct = (y: number) => ((hi - y) / hi) * 100;

  // A step on its own (no neighbour either side) is a short flat stroke across its width, so it still shows.
  const path = (s: CurveSeries) =>
    s.points
      .map((p, k) => {
        const joined = k > 0 && p.x - s.points[k - 1].x <= band;
        const alone = !joined && !(s.points[k + 1] && s.points[k + 1].x - p.x <= band);
        const point = (x: number) => `${(xPct(x) * 10).toFixed(1)},${yPct(p.y).toFixed(2)}`;
        return alone ? `M${point(p.x - band / 2)} L${point(p.x + band / 2)}` : `${joined ? "L" : "M"}${point(p.x)}`;
      })
      .join(" ");

  // Labels at round tens of battery % between the ends, as many as fit, clear of the end labels.
  const step = width > 0 ? [10, 20, 25, 50].find((s) => (s / (to - from)) * width >= LABEL_PX * 1.25) : undefined;
  const between: number[] = [];
  if (step) {
    for (let x = Math.ceil(from / step) * step; x < to; x += step) {
      const px = (xPct(x) / 100) * width;
      if (px >= LABEL_PX * 1.25 && px <= width - LABEL_PX * 1.25) between.push(x);
    }
  }

  // The step under the pointer, and each line's value in it.
  const stepAt = at === null ? null : Math.min(to - band / 2, Math.floor((at - from) / band) * band + from + band / 2);
  const hits = stepAt === null ? [] : drawn.map((s) => ({ s, p: s.points.find((p) => Math.abs(p.x - stepAt) < band / 2) ?? null }));
  const pick = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setAt(from + Math.max(0, Math.min(0.999, (clientX - rect.left) / rect.width)) * (to - from));
  };
  const pct = (x: number) => formatPercent(x);

  return (
    <div className="space-y-3">
      <div className="chart-touch relative bg-muted pt-8 pr-4 pb-2 pl-2 dark:bg-card">
        <span className="absolute top-1.5 left-2 font-mono text-xs text-faint" aria-hidden="true">
          kW
        </span>
        <div className="flex gap-2">
          <div className="relative h-36 w-8 shrink-0 text-right font-mono text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(v)}%` }}>
                {axisNumber.format(v)}
              </span>
            ))}
          </div>
          <div
            ref={plot}
            className="relative h-36 min-w-0 flex-1 touch-pan-y"
            role="img"
            aria-label={label}
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
              {drawn.map((s) => (
                <path key={s.name} d={path(s)} fill="none" className={s.stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              ))}
            </svg>
            {stepAt !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground" style={{ left: `${xPct(stepAt)}%` }} aria-hidden="true" />
                {hits.map(({ s, p }) =>
                  p ? (
                    <div
                      key={s.name}
                      className={cn("pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", s.swatch)}
                      style={{ left: `${xPct(p.x)}%`, top: `${yPct(p.y)}%` }}
                      aria-hidden="true"
                    />
                  ) : null,
                )}
                <div
                  ref={tip}
                  className="pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
                  style={{ left: tipLeft((xPct(stepAt) / 100) * width, tipWidth, width) }}
                  aria-live="polite"
                >
                  <span className="block text-muted-foreground">
                    Battery {pct(stepAt - band / 2)} to {pct(stepAt + band / 2)}
                  </span>
                  {hits.map(({ s, p }) => (
                    <span key={s.name} className="flex items-center gap-1.5">
                      {drawn.length > 1 && <span className={cn("size-2 shrink-0", s.swatch)} aria-hidden="true" />}
                      {drawn.length > 1 && <span className="text-muted-foreground">{s.name}</span>}
                      {p ? (
                        <span className="font-mono">
                          <Measure text={formatKw(p.y)} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No reading here</span>
                      )}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="relative mt-2 ml-10 h-4 text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
          <span className="absolute left-0">{pct(from)}</span>
          {between.map((x) => (
            <span key={x} className="absolute -translate-x-1/2" style={{ left: `${xPct(x)}%` }}>
              {pct(x)}
            </span>
          ))}
          <span className="absolute right-0">{pct(to)}</span>
        </div>
      </div>
      {drawn.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {drawn.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2", s.swatch)} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
