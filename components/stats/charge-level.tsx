"use client";

import dynamic from "next/dynamic";
import { ChartCard } from "@/components/chart-card";
import { ChartNote } from "@/components/stats/chart-note";
import { Value } from "@/components/stats/figures";
import { backTo } from "@/lib/kept";
import type { ChargeLevel } from "@/lib/charge-level";
import { formatClock, formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";

// Same box as the loaded chart (panel + h-40), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted dark:bg-card px-3 pt-4 pb-2">
      <div className="h-40 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./charge-level-plot"), { ssr: false, loading: Placeholder });

// Battery level over the span of `frame`, as far back as the readings go, with charging shaded. One switch
// drives every section, so it has none of its own. On home it sits under the Battery section as an h3; with
// `heading` (the Battery page) it is its own h2 section, with the level now above the chart.
export function ChargeLevelChart({
  level,
  now,
  frame,
  heading = false,
}: {
  level: ChargeLevel | null;
  now: number;
  frame: Pick<Timeframe, "span" | "title" | "words">;
  heading?: boolean;
}) {
  if (!level || level.points.length < 2) return null;
  // The line starts at the first reading in the span, so a long period doesn't squeeze it to one side.
  const from = Math.max(level.points.find((p) => p.at >= frame.span.from)?.at ?? level.from, frame.span.from);
  const to = Math.min(now, frame.span.to);
  const points = level.points.filter((p) => p.at >= from && p.at < to);
  const charging = level.charging.filter((c) => c.end > from && c.start < to).map((c) => ({ start: Math.max(c.start, from), end: Math.min(c.end, to) }));
  const latest = level.points[level.points.length - 1];
  // The readings kept start after the span does: "This year. Readings go back to 25 Sept." Home names the
  // window's start, as it always has; the Battery page names the first reading seen.
  const cut = heading ? backTo(frame.span, level.points[0].at, "Readings") : frame.span.from < level.from ? `Readings go back to ${formatShortDate(level.from)}.` : null;
  const caption = `${frame.title}.${cut ? ` ${cut}` : ""}`;
  return (
    <ChartCard
      as={heading ? "h2" : "h3"}
      title="Charge level"
      description="Battery level over time. Shaded is charging."
      summary={
        heading && (
          // The latest level, whatever span is picked; the chart below follows the span.
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              <Value text={`${Math.round(latest.level)}%`} />
            </span>
            <span className="text-base text-muted-foreground">
              latest reading, {formatShortDate(latest.at)}, {formatClock(latest.at)}
            </span>
          </p>
        )
      }
      caption={caption}
    >
      {/* With no readings, the note sits in the chart's own box, so a switch doesn't move what follows. */}
      {points.length >= 2 ? <Plot points={points} charging={charging} from={from} to={to} /> : <ChartNote>No readings {frame.words}.</ChartNote>}
    </ChartCard>
  );
}
