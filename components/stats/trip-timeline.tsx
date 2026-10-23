"use client";

import Link from "next/link";
import { useState } from "react";
import type { Drive } from "@/lib/drives";
import { formatClock, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { cn } from "@/lib/utils";

type Segment = { kind: "leg" | "stop"; start: number; end: number; leg?: Drive; n?: number };

// The trip across its time: each leg a solid block, each stop a striped gap, sized by how long it took.
// Hover, focus or tap a block for its details; the line under the strip says them, so touch gets the
// same as a mouse.
export function TripTimeline({ legs }: { legs: Drive[] }) {
  const [active, setActive] = useState<number | null>(null);
  const start = legs[0].start;
  const end = legs.at(-1)!.end;
  const segments: Segment[] = legs.flatMap((leg, k) => [
    ...(k > 0 ? [{ kind: "stop" as const, start: legs[k - 1].end, end: leg.start }] : []),
    { kind: "leg" as const, start: leg.start, end: leg.end, leg, n: k + 1 },
  ]);
  const pct = (t: number) => ((t - start) / (end - start)) * 100;
  const describe = (s: Segment) => {
    const time = `${formatClock(s.start)} to ${formatClock(s.end)}`;
    if (s.kind === "stop") return `Stop · ${time} · ${formatDuration((s.end - s.start) / 1000)}`;
    const d = s.leg!;
    return [
      `Drive ${s.n} · ${time}`,
      formatKm(d.km),
      d.kwh !== null && formatKwh(d.kwh),
      d.startLevel !== null && d.endLevel !== null && `battery ${Math.round(d.startLevel)}% to ${Math.round(d.endLevel)}%`,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const shown = active === null ? null : segments[active];

  return (
    <div className="space-y-2" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      <div className="relative h-12">
        {segments.map((s, k) => {
          const width = pct(s.end) - pct(s.start);
          return (
            <button
              key={s.start}
              type="button"
              aria-label={describe(s)}
              aria-pressed={active === k}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive(k)}
              onFocus={() => setActive(k)}
              onClick={() => setActive(k)}
              className={cn(
                "absolute inset-y-0 flex items-center justify-center overflow-hidden text-xs whitespace-nowrap tabular-nums outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring",
                s.kind === "leg" ? "bg-chart-accent text-background" : "trip-stop text-muted-foreground",
                active === k && "ring-2 ring-foreground",
              )}
              style={{ left: `${pct(s.start)}%`, width: `max(${width}%, 4px)` }}
            >
              {width > 12 && (s.kind === "leg" ? formatKm(s.leg!.km) : formatDuration((s.end - s.start) / 1000))}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-faint tabular-nums" aria-hidden="true">
        <span>{formatClock(start)}</span>
        <span>{formatClock(end)}</span>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span aria-live="polite">{shown ? describe(shown) : "Hover or tap a drive or a stop for its details."}</span>
        {shown?.kind === "leg" && (
          <Link href={`/stats/driving/${shown.start}?leg`} className="text-foreground underline-offset-4 hover:underline">
            Open this drive
          </Link>
        )}
      </p>
      <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-chart-accent" />
          Driving
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="trip-stop size-2" />
          Stopped
        </span>
      </div>
    </div>
  );
}
