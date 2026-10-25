"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Segmented } from "@/components/segmented";
import type { ChargeLevel } from "@/lib/charge-level";
import { formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";

// Same box as the loaded chart (panel + h-40), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted px-3 pt-4 pb-2">
      <div className="h-40 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./charge-level-plot"), { ssr: false, loading: Placeholder });

const DAY = 86_400_000;
const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

// Battery level over the last 7 or 30 days, with charging shaded. The switch is local: all 30 days
// arrive with the page. With `frame` (home, where one switch drives every section) it shows that span
// instead, as far back as the readings go, and has no switch of its own.
export function ChargeLevelChart({ level, now, frame }: { level: ChargeLevel | null; now: number; frame?: Pick<Timeframe, "span" | "title" | "words"> }) {
  const [days, setDays] = useState(7);
  if (!level || level.points.length < 2) return null;
  const from = Math.max(level.from, frame ? frame.span.from : now - days * DAY);
  const to = frame ? Math.min(now, frame.span.to) : now;
  const points = level.points.filter((p) => p.at >= from && p.at < to);
  const charging = level.charging.filter((c) => c.end > from && c.start < to).map((c) => ({ start: Math.max(c.start, from), end: Math.min(c.end, to) }));
  const latest = level.points[level.points.length - 1];
  // The readings kept start after the span does: "This year. Readings go back to 25 Sept."
  const cut = frame && frame.span.from < level.from ? ` Readings go back to ${formatShortDate(level.from)}.` : "";
  const caption = frame ? `${frame.title}.${cut}${charging.length > 0 ? " Shaded while charging." : ""}` : charging.length > 0 ? `Last ${days} days, shaded while charging` : `Last ${days} days`;
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Charge level</h2>
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{Math.round(latest.level)}%</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      <div className="space-y-4">
        {!frame && <Segmented label="Range" options={RANGES} value={days} onChange={setDays} />}
        {points.length >= 2 ? (
          <Plot points={points} charging={charging} from={from} to={to} />
        ) : (
          <p className="text-sm text-muted-foreground">{frame ? `No readings ${frame.words}.${cut}` : `No readings in the last ${days} days.`}</p>
        )}
      </div>
    </section>
  );
}
