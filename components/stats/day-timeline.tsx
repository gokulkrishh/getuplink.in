"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChartCard } from "@/components/chart-card";
import { FloatTip, useActiveMark } from "@/components/stats/float-tip";
import { statsHref } from "@/components/stats/periods";
import { type Day, type DayKind, dayParam } from "@/lib/day-timeline";
import { formatClock, formatDayLabel, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

const KINDS: { kind: DayKind; label: string; className: string }[] = [
  { kind: "driving", label: "Driving", className: "bg-chart-accent" },
  // The charging green of the map's pins and the charge level's bands.
  { kind: "charging", label: "Charging", className: "bg-charge" },
  { kind: "parked", label: "Parked", className: "bg-muted-foreground/45" },
  { kind: "asleep", label: "Asleep", className: "bg-muted-foreground/20" },
  { kind: "unknown", label: "Before tracking", className: "border border-muted-foreground/25" },
];
const style = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<DayKind, (typeof KINDS)[number]>;

// The last days as strips, after TeslaMate's timeline: when the car was driving, charging, parked or
// seen asleep. Hover, focus or tap a stretch for a tooltip with its times. The page's period switch names the
// period; `caption` is a caveat under the strips ("Days cover only the last 30 days").
export function DayTimeline({ days: all7, now, title = "Your days", caption }: { days: Day[]; now: number; title?: string; caption?: string }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useActiveMark<string>(list);
  // Days from before tracking began say nothing, so the strips start at the first tracked one.
  const firstTracked = all7.findIndex((d) => d.segments.some((s) => s.kind !== "unknown"));
  const days = firstTracked < 0 ? [] : all7.slice(firstTracked);
  const all = days.flatMap((d) => d.segments.map((s) => ({ ...s, key: `${d.day}-${s.start}` })));
  const shown = active && all.find((s) => s.key === active.key);
  if (!all.some((s) => s.kind !== "unknown")) return null;
  const describe = (s: (typeof all)[number]) => `${style[s.kind].label} · ${formatClock(s.start)} to ${formatClock(s.end)} · ${formatDuration((s.end - s.start) / 1000)}`;

  return (
    <ChartCard
      title={title}
      description={`What the car was doing ${days.length === 1 ? "through the day" : "each day"}, India time.`}
      caption={caption}
    >
      <div className="space-y-4">
      <ol ref={list} className="chart-touch space-y-1.5" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
        {[...days].reverse().map((d) => (
          <li key={d.day} className="flex items-center gap-3">
            <Link href={statsHref("driving", "custom", { from: dayParam(d.day), to: dayParam(d.day) })} className="tap-target w-16 shrink-0 text-xs text-muted-foreground underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 hover:text-foreground hover:decoration-foreground">
              {formatDayLabel(d.start, now)}
            </Link>
            <div className="relative h-4 flex-1">
              {d.segments.map((s) => {
                const key = `${d.day}-${s.start}`;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={describe({ ...s, key })}
                    aria-pressed={active?.key === key}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setActive({ key, el: e.currentTarget })}
                    onFocus={(e) => setActive({ key, el: e.currentTarget })}
                    onClick={(e) => setActive({ key, el: e.currentTarget })}
                    className={cn(
                      "absolute inset-y-0 outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring",
                      style[s.kind].className,
                      active?.key === key && "ring-2 ring-foreground",
                    )}
                    style={{ left: `${((s.start - d.start) / DAY) * 100}%`, width: `max(${((s.end - s.start) / DAY) * 100}%, 3px)` }}
                  />
                );
              })}
              {active && shown && active.key.startsWith(`${d.day}-`) && (
                <FloatTip anchor={active.el}>
                  <span className="block text-muted-foreground">
                    {style[shown.kind].label} · {formatDuration((shown.end - shown.start) / 1000)}
                  </span>
                  <span className="block">
                    {formatClock(shown.start)} to {formatClock(shown.end)}
                  </span>
                </FloatTip>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-3 text-xs text-faint" aria-hidden="true">
        <span className="w-16 shrink-0" />
        <div className="relative h-4 flex-1 tabular-nums">
          {["12 AM", "6 AM", "12 PM", "6 PM"].map((label, k) => (
            <span key={label} className="absolute" style={{ left: `${k * 25}%` }}>
              {label}
            </span>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {KINDS.map((k) => (
          <li key={k.kind} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2", k.className)} aria-hidden="true" />
            {k.label}
          </li>
        ))}
      </ul>
      </div>
    </ChartCard>
  );
}
