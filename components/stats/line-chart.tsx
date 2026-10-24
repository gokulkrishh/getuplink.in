"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Series = { name: string; className: string; points: { x: number; y: number }[] };

const W = 600;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 58 };

// One or more lines over a shared x axis (time, battery %, odometer). Hover or tap anywhere for a tooltip
// with each line's value at that x, and a dot on each line. A line with no reading near that x is left
// out of the tooltip rather than showing a far-off value. On a touch screen a vertical swipe still scrolls
// the page, and a tap elsewhere hides the tooltip.
export function LineChart({
  series,
  formatX,
  formatY,
  label,
  yFrom,
  signed = false,
}: {
  series: Series[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  label: string;
  // Start the y axis here instead of at the data's lowest value (0 for most).
  yFrom?: number;
  // Centre the y axis on zero (power, grade).
  signed?: boolean;
}) {
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // A tap elsewhere hides the tooltip (touch has no pointer leaving).
  useEffect(() => {
    if (at === null) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setAt(null);
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
  const lo = signed ? -reach : (yFrom ?? Math.min(...ys));
  const hi = signed ? reach : Math.max(...ys) + (Math.max(...ys) - lo) * 0.1 || lo + 1;
  const x = (v: number) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const nearest = (s: Series, v: number) => s.points.reduce((a, p) => (Math.abs(p.x - v) < Math.abs(a.x - v) ? p : a));
  // Close enough to count: within 3% of the chart's span.
  const reachX = (x1 - x0) * 0.03;
  const pick = (clientX: number, rect: DOMRect) => {
    const v = x0 + ((((clientX - rect.left) / rect.width) * W - PAD.left) / (W - PAD.left - PAD.right)) * (x1 - x0);
    setAt(Math.max(x0, Math.min(x1, v)));
  };
  const hits = at === null ? [] : drawn.flatMap((s) => {
    const p = nearest(s, at);
    return Math.abs(p.x - at) <= reachX ? [{ s, p }] : [];
  });
  const ticks = signed ? [lo, 0, hi] : [lo, (lo + hi) / 2, hi];

  return (
    <div className="space-y-2">
      <div ref={box} className="chart-touch relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y bg-muted"
        role="img"
        aria-label={label}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-faint font-mono text-[11px]">
              {formatY(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="fill-faint text-[11px]">
          {formatX(x0)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-faint text-[11px]">
          {formatX(x1)}
        </text>
        {drawn.map((s) => (
          <path
            key={s.name}
            d={s.points.map((p, k) => `${k ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ")}
            fill="none"
            strokeWidth={1.5}
            className={s.className}
          />
        ))}
        {at !== null && <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground" />}
        {hits.map(({ s, p }) => (
          <circle key={s.name} cx={x(p.x)} cy={y(p.y)} r={3.5} className={cn(s.className, "fill-background")} strokeWidth={2} />
        ))}
      </svg>
      {at !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
          style={{ left: `${(x(at) / W) * 100}%`, transform: `translateX(${x(at) / W > 0.6 ? "calc(-100% - 8px)" : "8px"})` }}
          aria-live="polite"
        >
          <span className="block text-muted-foreground">{formatX(hits[0]?.p.x ?? at)}</span>
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
                {formatY(p.y)}
              </span>
            ))
          )}
        </div>
      )}
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
    </div>
  );
}
