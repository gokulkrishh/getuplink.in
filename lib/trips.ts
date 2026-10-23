import type { Drive } from "@/lib/drives";

// Drives joined into trips: a stop shorter than STOP_MS (a shop, a pickup) keeps going on the same trip.
// Each leg keeps its own figures; the trip only adds them up, so nothing is guessed. Pure, so tested.

export const STOP_MS = 60 * 60_000;

export type Trip = {
  start: number;
  end: number;
  km: number;
  kwh: number | null; // null if any leg's energy is unknown
  startLevel: number | null;
  endLevel: number | null;
  legs: Drive[]; // oldest first
  stops: number;
};

// Trips from drives in any order, newest first.
export function groupTrips(drives: Drive[]): Trip[] {
  const sorted = [...drives].sort((a, b) => a.start - b.start);
  const groups: Drive[][] = [];
  for (const d of sorted) {
    const last = groups.at(-1);
    if (last && d.start - last.at(-1)!.end < STOP_MS) last.push(d);
    else groups.push([d]);
  }
  return groups
    .map((legs) => ({
      start: legs[0].start,
      end: legs.at(-1)!.end,
      km: legs.reduce((sum, d) => sum + d.km, 0),
      kwh: legs.every((d) => d.kwh !== null) ? legs.reduce((sum, d) => sum + d.kwh!, 0) : null,
      startLevel: legs[0].startLevel,
      endLevel: legs.at(-1)!.endLevel,
      legs,
      stops: legs.length - 1,
    }))
    .reverse();
}
