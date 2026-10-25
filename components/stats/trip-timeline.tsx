"use client";

import Link from "next/link";
import { useRef } from "react";
import { FloatTip, useActiveMark } from "@/components/stats/float-tip";
import type { Drive } from "@/lib/drives";
import { formatClock, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { cn } from "@/lib/utils";

type Segment = { kind: "leg" | "stop"; start: number; end: number; leg?: Drive; n?: number };

// The trip across its time: each leg a solid block, each stop a striped gap, sized by how long it took.
// Hover, focus or tap a block for a tooltip with its details; a drive's has a link to that drive.
export function TripTimeline({ legs }: { legs: Drive[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useActiveMark<number>(box);
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
  const shown = active && segments[active.key];

  return (
    <div ref={box} className="chart-touch space-y-2" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      <div className="relative h-12">
        {segments.map((s, k) => {
          const width = pct(s.end) - pct(s.start);
          return (
            <button
              key={s.start}
              type="button"
              aria-label={describe(s)}
              aria-pressed={active?.key === k}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive({ key: k, el: e.currentTarget })}
              onFocus={(e) => setActive({ key: k, el: e.currentTarget })}
              onClick={(e) => setActive({ key: k, el: e.currentTarget })}
              className={cn(
                "absolute inset-y-0 flex items-center justify-center overflow-hidden text-xs whitespace-nowrap tabular-nums outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring",
                s.kind === "leg" ? "bg-chart-accent text-background" : "trip-stop text-muted-foreground",
                active?.key === k && "ring-2 ring-foreground",
              )}
              style={{ left: `${pct(s.start)}%`, width: `max(${width}%, 4px)` }}
            >
              {width > 12 && (s.kind === "leg" ? formatKm(s.leg!.km) : formatDuration((s.end - s.start) / 1000))}
            </button>
          );
        })}
        {active && shown && (
          <FloatTip anchor={active.el} interactive={shown.kind === "leg"}>
            <Tip segment={shown} />
          </FloatTip>
        )}
      </div>
      <div className="flex justify-between text-xs text-faint tabular-nums" aria-hidden="true">
        <span>{formatClock(start)}</span>
        <span>{formatClock(end)}</span>
      </div>
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

// A stop's length and times, or a drive's times, distance, energy and battery, with a link to the drive.
function Tip({ segment: s }: { segment: Segment }) {
  const time = `${formatClock(s.start)} to ${formatClock(s.end)}`;
  if (s.kind === "stop") {
    return (
      <>
        <span className="block text-muted-foreground">Stopped {formatDuration((s.end - s.start) / 1000)}</span>
        <span className="block">{time}</span>
      </>
    );
  }
  const d = s.leg!;
  return (
    <>
      <span className="block text-muted-foreground">
        Drive {s.n} · {time}
      </span>
      <span className="block font-mono">{[formatKm(d.km), d.kwh !== null && formatKwh(d.kwh)].filter(Boolean).join(" · ")}</span>
      {d.startLevel !== null && d.endLevel !== null && (
        <span className="block font-mono">
          Battery {Math.round(d.startLevel)}% to {Math.round(d.endLevel)}%
        </span>
      )}
      <Link href={`/stats/driving/${s.start}?leg`} className="mt-1 block text-foreground underline underline-offset-4">
        Open this drive
      </Link>
    </>
  );
}
