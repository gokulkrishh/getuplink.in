"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clockTicks } from "@/components/stats/drive-lanes";
import { type Climate, inSpans, type Run, tempAxis, valueAt } from "@/lib/drive-climate";
import { formatCelsius, formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

// The lines, by name, with their colours written out in full so Tailwind finds each class. Inside and
// outside keep the colours of the Temperatures chart on the Battery page.
const LINES = [
  { key: "set", name: "Set temperature", stroke: "stroke-chart-accent", swatch: "bg-chart-accent", dot: "bg-chart-accent" },
  { key: "inside", name: "Inside", stroke: "stroke-positive", swatch: "bg-positive", dot: "bg-positive" },
  { key: "outside", name: "Outside", stroke: "stroke-muted-foreground", swatch: "bg-muted-foreground", dot: "bg-muted-foreground" },
] as const;

// A held series as steps: each reading's value runs flat until the next one. `x` and `y` give a point's place
// in percent of the plot.
const steps = (run: Run, x: (t: number) => number, y: (v: number) => number) =>
  run.map((p, k) => (k === 0 ? `M${(x(p.t) * 10).toFixed(1)},${y(p.v).toFixed(2)}` : `H${(x(p.t) * 10).toFixed(1)} V${y(p.v).toFixed(2)}`)).join(" ");

// The drive's climate over its own time, `from` to `to`, in the chart panel: °C up the side, the set temperature
// as a step line that stops while the AC was off (those stretches are shaded), the inside and outside
// temperatures, and clock times along the bottom. Every trace on the page shares `from`, `to` and the gutter,
// so the axes line up. The axes are HTML, so their text stays the same size on a phone; the SVG draws only
// the lines. Each reading holds until the next one, so the line is flat between them. Hover, tap or drag
// for the values at that moment; a vertical swipe still scrolls the page, and a tap elsewhere hides it.
export function ClimateTrace({ label, climate, from, to }: { label: string; climate: Climate; from: number; to: number }) {
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

  const lines = LINES.map((line) => ({ ...line, runs: climate[line.key] })).filter((line) => line.runs.length > 0);
  const values = lines.flatMap((line) => line.runs.flatMap((run) => run.map((p) => p.v)));
  if (values.length === 0 || to <= from) return null;
  const { lo, hi, ticks } = tempAxis(values);
  const xPct = (t: number) => ((t - from) / (to - from)) * 100;
  const yPct = (v: number) => ((hi - v) / (hi - lo)) * 100;

  const inWindow = at !== null && climate.windows.some((w) => at >= w.start && at <= w.end);
  const cursor = at;
  const off = cursor !== null && inSpans(climate.off, cursor);
  // What was in force at the cursor, per line. The set temperature has none while the AC was off.
  const shown = cursor === null || !inWindow ? [] : lines.flatMap((line) => {
    const v = valueAt(line.runs, cursor);
    return v === null ? [] : [{ ...line, v }];
  });
  const pick = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setAt(from + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (to - from));
  };
  const between = clockTicks(from, to, width);
  const hasOff = (climate.off?.length ?? 0) > 0;

  return (
    <div className="space-y-2">
      <div className="chart-touch relative bg-muted pt-8 pr-4 pb-2 pl-2 dark:bg-card">
        <span className="absolute top-1.5 left-2 font-mono text-xs text-faint" aria-hidden="true">
          °C
        </span>
        <div className="flex gap-2">
          <div className="relative h-28 w-8 shrink-0 text-right font-mono text-xs whitespace-nowrap text-faint tabular-nums" aria-hidden="true">
            {ticks.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(v)}%` }}>
                {v}
              </span>
            ))}
          </div>
          <div
            ref={plot}
            className="relative h-28 min-w-0 flex-1 touch-pan-y"
            role="img"
            aria-label={`${label} from ${formatClock(from)} to ${formatClock(to)}, between ${formatCelsius(Math.min(...values))} and ${formatCelsius(Math.max(...values))}`}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
          >
            {ticks.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${yPct(v)}%` }} aria-hidden="true" />
            ))}
            {climate.off?.map((s) => (
              <div
                key={s.start}
                className="pointer-events-none absolute inset-y-0 bg-muted-foreground/15"
                style={{ left: `${xPct(s.start)}%`, width: `${xPct(s.end) - xPct(s.start)}%`, minWidth: 3 }}
                aria-hidden="true"
              />
            ))}
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              {lines.map((line) =>
                line.runs.map((run) => (
                  <path
                    key={`${line.key}-${run[0].t}`}
                    d={steps(run, xPct, yPct)}
                    fill="none"
                    className={line.stroke}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                )),
              )}
            </svg>
            {cursor !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground" style={{ left: `${xPct(cursor)}%` }} aria-hidden="true" />
                {shown.map((line) => (
                  <div
                    key={line.key}
                    className={cn("pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", line.dot)}
                    style={{ left: `${xPct(cursor)}%`, top: `${yPct(line.v)}%` }}
                    aria-hidden="true"
                  />
                ))}
                <div
                  className="pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
                  style={{ left: `${xPct(cursor)}%`, transform: `translateX(${xPct(cursor) > 50 ? "calc(-100% - 8px)" : "8px"})` }}
                  aria-live="polite"
                >
                  <span className="block text-muted-foreground">{formatClock(cursor)}</span>
                  {shown.length === 0 && !off ? (
                    <span className="block text-muted-foreground">No data here</span>
                  ) : (
                    <>
                      {off && inWindow && <span className="block text-muted-foreground">AC off</span>}
                      {shown.map((line) => (
                        <span key={line.key} className="block font-mono">
                          <span className="font-sans text-muted-foreground">{line.name}</span> {formatCelsius(line.v)}
                        </span>
                      ))}
                    </>
                  )}
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
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line.key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-0.5 w-3", line.swatch)} aria-hidden="true" />
            {line.name}
          </li>
        ))}
        {hasOff && (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-3 bg-muted-foreground/15" aria-hidden="true" />
            AC off
          </li>
        )}
      </ul>
    </div>
  );
}
