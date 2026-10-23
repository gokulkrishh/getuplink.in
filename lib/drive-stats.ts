import { DRIVE_DAYS, type Drive } from "@/lib/drives";
import type { DrivingFigure, DrivingFigures } from "@/lib/driving-figures";
import { inSpan, type Period, periodSpan, previousSpan, slotsFor, type Span } from "@/lib/periods";
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

// The drives' energy, and Wh/km over their distance, or null with under 1 km of drives that have an
// energy figure.
function driveEnergy(drives: Drive[]): { kwh: number | null; whPerKm: number | null } {
  const counted = drives.filter((d) => d.kwh !== null);
  const km = counted.reduce((sum, d) => sum + d.km, 0);
  if (km < 1) return { kwh: null, whPerKm: null };
  const kwh = counted.reduce((sum, d) => sum + d.kwh!, 0);
  return { kwh, whPerKm: (kwh * 1000) / km };
}

// Energy used driving, and efficiency, from the drives wherever they cover the whole span (they reach
// back DRIVE_DAYS, or to when tracking began), like TeslaMate: driving only, the same in every period.
// Longer spans keep the lifetime counter's figure, which includes energy used while parked.
export function withDriveEfficiency(figures: DrivingFigures, drives: Drive[], now: number): DrivingFigures {
  const windowFrom = now - DRIVE_DAYS * DAY;
  const covered = (span: Span) => span.from >= windowFrom || (figures.since !== null && figures.since >= windowFrom);
  const fill = (f: DrivingFigure, span: Span): DrivingFigure => {
    const fromDrives = driveEnergy(drives.filter((d) => inSpan(d.start, span)));
    if (covered(span)) return { ...f, whPerKm: fromDrives.whPerKm, kwh: fromDrives.kwh };
    return { ...f, whPerKm: f.whPerKm ?? fromDrives.whPerKm, kwh: f.kwh ?? fromDrives.kwh };
  };
  const periods = Object.fromEntries(
    Object.entries(figures.periods).map(([period, p]) => {
      const slots = slotsFor(period as Period, now);
      const before = previousSpan(period as Period, now);
      return [
        period,
        {
          ...p,
          current: fill(p.current, periodSpan(period as Period, now)),
          previous: p.previous && before ? fill(p.previous, before) : p.previous,
          bars: p.bars.map((b, k) => (slots[k] ? fill(b, slots[k]) : b)),
        },
      ];
    }),
  ) as DrivingFigures["periods"];
  return { ...figures, periods };
}
