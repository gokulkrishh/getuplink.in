import type { Drive } from "@/lib/drives";
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
