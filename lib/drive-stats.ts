import { DRIVE_DAYS, type Drive } from "@/lib/drives";
import { groupTrips } from "@/lib/trips";
import type { DrivingFigure, DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import { inSpan, type Period, periodTimeframe, type Span, type Timeframe } from "@/lib/periods";
import { median } from "@/lib/telemetry-derive";

// Drive stats after TeslaMate's dashboard, from the drives Uplink rebuilt (the last 90 days). Counts and
// medians only: nothing is projected forward.
export type DriveStats = { trips: number; drives: number; km: number; medianKm: number; longestKm: number; hours: number; kmPerDay: number; days: number };

const DAY = 86_400_000;

// days: from when tracking began or the window's start, whichever is later, to now.
export function driveStats(drives: Drive[], windowFrom: number, since: number | null, now: number): DriveStats | null {
  if (drives.length === 0) return null;
  const km = drives.reduce((sum, d) => sum + d.km, 0);
  const days = Math.max(1, (now - Math.max(windowFrom, since ?? windowFrom)) / DAY);
  return {
    trips: groupTrips(drives).length,
    drives: drives.length,
    km,
    medianKm: median(drives.map((d) => d.km)),
    longestKm: Math.max(...drives.map((d) => d.km)),
    hours: drives.reduce((sum, d) => sum + (d.end - d.start), 0) / 3_600_000,
    kmPerDay: km / days,
    days,
  };
}

// The drives' energy, and Wh/km over their distance. kWh is the sum of every drive with an energy figure,
// however short, so a span's figure is the sum of its bars'; null when no drive has one (none were found,
// or the odometer moved without one). Wh/km is null under 1 km, too short to mean anything.
function driveEnergy(drives: Drive[]): { kwh: number | null; whPerKm: number | null } {
  const counted = drives.filter((d) => d.kwh !== null);
  if (counted.length === 0) return { kwh: null, whPerKm: null };
  const km = counted.reduce((sum, d) => sum + d.km, 0);
  const kwh = counted.reduce((sum, d) => sum + d.kwh!, 0);
  return { kwh, whPerKm: km < 1 ? null : (kwh * 1000) / km };
}

// Energy used driving, and efficiency, from the drives wherever they cover the whole span (they reach
// back DRIVE_DAYS, or to when tracking began), like TeslaMate: driving only, the same in every period.
// Longer spans keep the lifetime counter's figure, which includes energy used while parked.
export function withDriveEfficiency(figures: DrivingFigures, drives: Drive[], now: number): DrivingFigures {
  const periods = Object.fromEntries(
    Object.entries(figures.periods).map(([period, p]) => [period, timeframeEfficiency(p, periodTimeframe(period as Period, now), drives, figures.since, now)]),
  ) as DrivingFigures["periods"];
  return { ...figures, periods };
}

// The same for one timeframe's figures, like a range picked by date. `since` is when tracking began.
export function timeframeEfficiency(p: DrivingPeriod, frame: Timeframe, drives: Drive[], since: number | null, now: number): DrivingPeriod {
  const windowFrom = now - DRIVE_DAYS * DAY;
  const covered = (span: Span) => span.from >= windowFrom || (since !== null && since >= windowFrom);
  const fill = (f: DrivingFigure, span: Span): DrivingFigure => {
    const fromDrives = driveEnergy(drives.filter((d) => inSpan(d.start, span)));
    if (covered(span)) return { ...f, whPerKm: fromDrives.whPerKm, kwh: fromDrives.kwh };
    return { ...f, whPerKm: f.whPerKm ?? fromDrives.whPerKm, kwh: f.kwh ?? fromDrives.kwh };
  };
  return {
    ...p,
    current: fill(p.current, frame.span),
    previous: p.previous && frame.previous ? fill(p.previous, frame.previous) : p.previous,
    bars: p.bars.map((b, k) => (frame.slots[k] ? fill(b, frame.slots[k]) : b)),
  };
}
