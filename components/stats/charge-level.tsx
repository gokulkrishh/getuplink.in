"use client";

import dynamic from "next/dynamic";
import { ChartCard } from "@/components/chart-card";
import { ChartNote } from "@/components/stats/chart-note";
import { Value } from "@/components/stats/figures";
import type { ChargeLevel, ChargeStretch, LevelPoint } from "@/lib/charge-level";
import { formatClock, formatLevels, formatPercent, formatShortDate } from "@/lib/format";
import type { Timeframe } from "@/lib/periods";

const HOUR = 3_600_000;
const when = (t: number) => `${formatShortDate(t)}, ${formatClock(t)}`;

// A charge in words for its tip: "Charging · 25 Oct, 9:25 PM to 9:55 PM · 46% to 70%". The date repeats
// when it ran past midnight. The levels are the last reading at or before its start and the first at or
// after its end, each within an hour (the car sits on the charger between them); without both, they are
// left out rather than guessed.
export function chargeTip(c: ChargeStretch, points: LevelPoint[]): string {
  const span = formatShortDate(c.start) === formatShortDate(c.end) ? `${when(c.start)} to ${formatClock(c.end)}` : `${when(c.start)} to ${when(c.end)}`;
  const before = points.findLast((p) => p.at <= c.start && p.at >= c.start - HOUR);
  const after = points.find((p) => p.at >= c.end && p.at <= c.end + HOUR);
  const levels = before && after ? ` · ${formatLevels(before.level, after.level)}` : "";
  return `Charging · ${span}${levels}`;
}

// What the marks mean: the line is the battery level, a green band a charge (the map's charging green).
export function ChargeLegend({ charging }: { charging: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 bg-chart-accent" aria-hidden="true" />
        Battery level
      </li>
      {charging && (
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 bg-charge/40" aria-hidden="true" />
          Charging
        </li>
      )}
    </ul>
  );
}

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
  // Each charge drawn inside the span, with its whole time and levels for the tip (see chargeTip).
  const charging = level.charging
    .filter((c) => c.end > from && c.start < to)
    .map((c) => ({ start: Math.max(c.start, from), end: Math.min(c.end, to), tip: chargeTip(c, level.points) }));
  const latest = level.points[level.points.length - 1];
  // The readings kept start after the span does: "Since 25 Sept", else the span ("This month"). Home names
  // the window's start, as it always has; the Battery page names the first reading seen.
  const since = heading ? level.points[0].at : level.from;
  const caption = since > frame.span.from ? `Since ${formatShortDate(since)}` : frame.title;
  return (
    <ChartCard
      as={heading ? "h2" : "h3"}
      title="Charge level"
      description="Battery level over time."
      summary={
        heading && (
          // The latest level, whatever span is picked; the chart below follows the span.
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">
              <Value text={formatPercent(latest.level)} />
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
      {points.length >= 2 ? (
        <div className="space-y-3">
          <Plot points={points} charging={charging} from={from} to={to} />
          <ChargeLegend charging={charging.length > 0} />
        </div>
      ) : (
        <ChartNote>No readings {frame.words}.</ChartNote>
      )}
    </ChartCard>
  );
}
