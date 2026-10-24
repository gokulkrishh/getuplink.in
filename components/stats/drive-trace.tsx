"use client";

import { useState } from "react";
import { formatClock } from "@/lib/format";

const W = 600;
const H = 160;
const PAD = { top: 12, right: 8, bottom: 22, left: 36 };

// A value over the drive's time (battery %, speed), as a line. Hover or tap anywhere for a tooltip with
// the value at that moment.
export function DriveTrace({
  points,
  from,
  to,
  unit,
  label,
  max: fixedMax,
  signed = false,
}: {
  points: { t: number; v: number }[];
  from: number;
  to: number;
  unit: string;
  label: string;
  max?: number;
  // Values either side of zero (acceleration and braking): the axis is centred on a zero line.
  signed?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2 || to <= from) return null;
  const reach = Math.max(1, ...points.map((p) => Math.abs(p.v))) * 1.1;
  const max = fixedMax ?? (signed ? reach : Math.max(1, ...points.map((p) => p.v)) * 1.1);
  const min = signed ? -max : 0;
  const x = (t: number) => PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((max - v) / (max - min)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, k) => `${k ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const shown = active === null ? null : points[active];
  const pick = (clientX: number, rect: DOMRect) => {
    const t = from + ((((clientX - rect.left) / rect.width) * W - PAD.left) / (W - PAD.left - PAD.right)) * (to - from);
    let best = 0;
    points.forEach((p, k) => Math.abs(p.t - t) < Math.abs(points[best].t - t) && (best = k));
    setActive(best);
  };
  const ticks = signed ? [min, 0, max] : [0, max / 2, max];
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

  return (
    <div className="chart-touch relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none bg-muted"
        role="img"
        aria-label={`${label} from ${formatClock(from)} to ${formatClock(to)}: between ${fmt(Math.min(...points.map((p) => p.v)))} and ${fmt(Math.max(...points.map((p) => p.v)))} ${unit}.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 3" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-faint font-mono text-[11px]">
              {Math.abs(max) < 10 ? Math.round(v * 10) / 10 : Math.round(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="fill-faint text-[11px]">
          {formatClock(from)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-faint text-[11px]">
          {formatClock(to)}
        </text>
        <path d={path} fill="none" className="stroke-chart-accent" strokeWidth={1.5} />
        {shown && (
          <>
            <line x1={x(shown.t)} x2={x(shown.t)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground" />
            <circle cx={x(shown.t)} cy={y(shown.v)} r={3.5} className="fill-chart-accent" />
          </>
        )}
      </svg>
      {shown && (
        <div
          className="pointer-events-none absolute top-1 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
          style={{ left: `${(x(shown.t) / W) * 100}%`, transform: `translateX(${x(shown.t) / W > 0.6 ? "calc(-100% - 8px)" : "8px"})` }}
          aria-live="polite"
        >
          <span className="block text-muted-foreground">{formatClock(shown.t)}</span>
          <span className="block font-mono">
            {fmt(shown.v)} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
