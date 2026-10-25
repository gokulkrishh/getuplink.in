"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { unitNotes } from "./chart-caption";

export type Lane = {
  name: string;
  unit: string;
  points: { t: number; v: number }[];
  // Values either side of zero (power, acceleration, grade): the lane is centred on a zero line.
  signed?: boolean;
  // A fixed top, like 100 for battery %.
  max?: number;
};

const W = 420;
const PAD = { top: 4, right: 6, bottom: 20, left: 34 };
const LANE = 64; // a lane's plot height
const TITLE = 24; // room above each lane for its name, clear of the lane above

// Everything streamed during a drive (speed, power, acceleration, road grade, battery) as one chart: a
// lane each on its own scale, since km/h, kW and m/s² can't share an axis, over one shared time axis.
// Hover, tap or drag anywhere for one line through every lane and one tooltip with each value at that
// moment, so a spike in one lane can be read against the others. On a touch screen a vertical swipe
// still scrolls the page, and a tap elsewhere hides the tooltip.
export function DriveLanes({ lanes: all, from, to }: { lanes: Lane[]; from: number; to: number }) {
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (at === null) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [at]);

  const lanes = all.filter((l) => l.points.length >= 2);
  if (lanes.length === 0 || to <= from) return null;
  const H = PAD.top + lanes.length * (TITLE + LANE) + PAD.bottom;
  const x = (t: number) => PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
  const pick = (clientX: number, rect: DOMRect) => {
    const t = from + ((((clientX - rect.left) / rect.width) * W - PAD.left) / (W - PAD.left - PAD.right)) * (to - from);
    setAt(Math.max(from, Math.min(to, t)));
  };
  // Close enough to count: within 2% of the drive's length, so a lane without a reading near there says so.
  const reach = (to - from) * 0.02;
  const drawn = lanes.map((lane, k) => {
    const vs = lane.points.map((p) => p.v);
    const span = Math.max(1e-9, ...vs.map(Math.abs)) * 1.1;
    const hi = lane.max ?? (lane.signed ? span : Math.max(1e-9, ...vs) * 1.1);
    const lo = lane.signed ? -hi : 0;
    const top = PAD.top + k * (TITLE + LANE) + TITLE;
    const y = (v: number) => top + ((hi - v) / (hi - lo)) * LANE;
    const near = at === null ? null : lane.points.reduce((a, p) => (Math.abs(p.t - at) < Math.abs(a.t - at) ? p : a));
    return { lane, hi, lo, top, y, hit: near && Math.abs(near.t - at!) <= reach ? near : null };
  });
  const fmt = (v: number) => (Math.abs(v) < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString());

  return (
    <figure className="space-y-2">
    <div ref={box} className="chart-touch relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y bg-muted"
        role="img"
        aria-label={`${lanes.map((l) => l.name).join(", ")} from ${formatClock(from)} to ${formatClock(to)}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
      >
        {drawn.map(({ lane, hi, lo, top, y }) => (
          <g key={lane.name}>
            <text x={PAD.left} y={top - 7} className="fill-muted-foreground text-[11px]">
              {lane.name} <tspan className="fill-faint">{lane.unit}</tspan>
            </text>
            {(lane.signed ? [hi, 0, lo] : [hi, lo]).map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v === lo && !lane.signed ? undefined : "3 3"} />
                <text x={PAD.left - 4} y={y(v) + 3.5} textAnchor="end" className="fill-faint font-mono text-[9px]">
                  {fmt(v)}
                </text>
              </g>
            ))}
            <path
              d={lane.points.map((p, k) => `${k ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
              fill="none"
              className="stroke-chart-accent"
              strokeWidth={1.25}
            />
          </g>
        ))}
        <text x={PAD.left} y={H - 5} className="fill-faint text-[10px]">
          {formatClock(from)}
        </text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" className="fill-faint text-[10px]">
          {formatClock(to)}
        </text>
        {at !== null && (
          <>
            <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground" />
            {drawn.map(({ lane, y, hit }) => hit && <circle key={lane.name} cx={x(hit.t)} cy={y(hit.v)} r={3} className="fill-chart-accent" />)}
          </>
        )}
      </svg>
      {at !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap tabular-nums shadow-sm"
          style={{ left: `${(x(at) / W) * 100}%`, transform: `translateX(${x(at) / W > 0.5 ? "calc(-100% - 8px)" : "8px"})` }}
          aria-live="polite"
        >
          <span className="block text-muted-foreground">{formatClock(at)}</span>
          {drawn.map(({ lane, hit }) => (
            <span key={lane.name} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{lane.name}</span>
              <span className="font-mono">{hit ? `${fmt(hit.v)} ${lane.unit}` : "No reading"}</span>
            </span>
          ))}
        </div>
      )}
    </div>
      <figcaption className="text-xs text-muted-foreground">
        Over the drive, from {formatClock(from)} to {formatClock(to)}: {lanes.map((l) => `${l.name.toLowerCase()} in ${l.unit}`).join(", ")}. Each lane has its own
        scale. Hover or tap for every value at one moment. {unitNotes(lanes.map((l) => l.unit))}
      </figcaption>
    </figure>
  );
}
