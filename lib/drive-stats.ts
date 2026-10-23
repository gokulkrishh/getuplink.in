import type { Drive } from "@/lib/drives";
import type { DrivingFigures } from "@/lib/driving-figures";
import { inSpan, type Period, periodSpan, slotsFor, type Span } from "@/lib/periods";
import { median } from "@/lib/telemetry-derive";

// Drive stats after TeslaMate's dashboard, from the drives Uplink rebuilt (the last 90 days). Counts and
// medians only: nothing is projected forward.
export type DriveStats = { drives: number; km: number; medianKm: number; longestKm: number; hours: number; kmPerDay: number; days: number };

const DAY = 86_400_000;

// days: from when tracking began or the window's start, whichever is later, to now.
export function driveStats(drives: Drive[], windowFrom: number, since: number | null, now: number): DriveStats | null {
  if (drives.length === 0) return null;
  const km = drives.reduce((sum, d) => sum + d.km, 0);
  const days = Math.max(1, (now - Math.max(windowFrom, since ?? windowFrom)) / DAY);
  return {
    drives: drives.length,
    km,
    medianKm: median(drives.map((d) => d.km)),
    longestKm: Math.max(...drives.map((d) => d.km)),
    hours: drives.reduce((sum, d) => sum + (d.end - d.start), 0) / 3_600_000,
    kmPerDay: km / days,
    days,
  };
}

// Wh/km, like DrivingFigure: the drives' energy over their distance, or null with under 1 km of drives
// that have an energy figure.
function driveEfficiency(drives: Drive[]): number | null {
  const counted = drives.filter((d) => d.kwh !== null);
  const km = counted.reduce((sum, d) => sum + d.km, 0);
  return km >= 1 ? (counted.reduce((sum, d) => sum + d.kwh!, 0) * 1000) / km : null;
}

// Efficiency from the drives wherever the lifetime counter can't give one: it needs a reading from before
// the span, which a period that began before tracking did doesn't have. That's how TeslaMate counts it:
// energy used while driving, over the distance driven.
export function withDriveEfficiency(figures: DrivingFigures, drives: Drive[], now: number): DrivingFigures {
  const inSpanOf = (span: Span) => drives.filter((d) => inSpan(d.start, span));
  const periods = Object.fromEntries(
    Object.entries(figures.periods).map(([period, p]) => {
      const slots = slotsFor(period as Period, now);
      return [
        period,
        {
          ...p,
          current: { ...p.current, whPerKm: p.current.whPerKm ?? driveEfficiency(inSpanOf(periodSpan(period as Period, now))) },
          bars: p.bars.map((b, k) => ({ ...b, whPerKm: b.whPerKm ?? (slots[k] ? driveEfficiency(inSpanOf(slots[k])) : null) })),
        },
      ];
    }),
  ) as DrivingFigures["periods"];
  return { ...figures, periods };
}
