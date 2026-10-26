import { MIN_EFFICIENCY_KM } from "@/lib/dashboard-summary";
import { DRIVE_DAYS, type Drive } from "@/lib/drives";
import { groupTrips } from "@/lib/trips";
import type { DrivingFigure, DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import { sumKnown } from "@/lib/format";
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

// How much of a drive's distance falls in a span: the sum of its hours there (see Drive.hourKm), since
// every bar starts on an IST hour. A drive without them counts whole where it started.
export function driveKmIn(d: Drive, span: Span): number {
  if (!d.hourKm) return inSpan(d.start, span) ? d.km : 0;
  return d.hourKm.reduce((sum, h) => sum + (inSpan(h.from, span) ? h.km : 0), 0);
}

// The drives' energy in a span, each drive's kWh shared out by the distance it drove there, so a
// 7:14 AM to 8:19 AM drive counts in both hours and the bars add up to the span's total. Null when no
// drive with an energy figure ran in it. Wh/km over that distance, or null under 1 km.
export function driveEnergy(drives: Drive[], span: Span): { kwh: number | null; whPerKm: number | null } {
  let km = 0;
  let kwh = 0;
  let any = false;
  for (const d of drives) {
    if (d.kwh === null || d.km <= 0) continue;
    const part = driveKmIn(d, span);
    if (part <= 0) continue;
    any = true;
    km += part;
    kwh += (d.kwh * part) / d.km;
  }
  if (!any) return { kwh: null, whPerKm: null };
  return { kwh, whPerKm: km >= 1 ? (kwh * 1000) / km : null };
}

// How far back the owner's own consumption is averaged for the real-world range estimate.
export const CONSUMPTION_DAYS = 30;

// The owner's average consumption over the last CONSUMPTION_DAYS of driving (see driveEnergy), with the
// distance it rests on. Null under MIN_EFFICIENCY_KM, where a figure would be mostly noise, or with no
// drive that has an energy figure. Never guessed from a rated figure.
export function recentConsumption(drives: Drive[], now: number): { whPerKm: number; km: number } | null {
  const span = { from: now - CONSUMPTION_DAYS * DAY, to: now };
  const km = drives.reduce((sum, d) => sum + (d.kwh === null ? 0 : driveKmIn(d, span)), 0);
  const { whPerKm } = driveEnergy(drives, span);
  return whPerKm === null || km < MIN_EFFICIENCY_KM ? null : { whPerKm, km };
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
    const fromDrives = driveEnergy(drives, span);
    if (covered(span)) return { ...f, whPerKm: fromDrives.whPerKm, kwh: fromDrives.kwh };
    return { ...f, whPerKm: f.whPerKm ?? fromDrives.whPerKm, kwh: f.kwh ?? fromDrives.kwh };
  };
  const bars = p.bars.map((b, k) => (frame.slots[k] ? fill(b, frame.slots[k]) : b));
  // A span older than the drives (a Year from before the window) mixes sources: its recent bars come
  // from the drives and its older ones from the lifetime counter, which counts parked use too. Its total
  // is then the raw sum of its bars, as every headline is, when every bar with driving has a figure.
  const current = fill(p.current, frame.span);
  const whole = bars.every((b) => b.kwh !== null || !b.km);
  if (!covered(frame.span) && whole && bars.some((b) => b.kwh !== null)) current.kwh = sumKnown(bars.map((b) => b.kwh));
  return {
    ...p,
    current,
    previous: p.previous && frame.previous ? fill(p.previous, frame.previous) : p.previous,
    bars,
  };
}
