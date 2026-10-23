"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type Series = { name: string; className: string; points: { x: number; y: number }[] };

const W = 600;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 58 };

// One or more lines over a shared x axis (time, battery %, odometer). Hover or tap anywhere for every
// line's value at that x; the line under the chart says them, so touch gets the same as a mouse.
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
  const pick = (clientX: number, rect: DOMRect) => setAt(x0 + ((((clientX - rect.left) / rect.width) * W - PAD.left) / (W - PAD.left - PAD.right)) * (x1 - x0));
  const ticks = signed ? [lo, 0, hi] : [lo, (lo + hi) / 2, hi];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none bg-muted"
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
      </svg>
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {at === null
          ? "Hover or tap the chart for the values at a moment."
          : [formatX(at), ...drawn.map((s) => `${drawn.length > 1 ? `${s.name} ` : ""}${formatY(nearest(s, at).y)}`)].join(" · ")}
      </p>
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
