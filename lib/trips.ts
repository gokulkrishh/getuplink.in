import type { Drive } from "@/lib/drives";
import { DECIMALS, shownTotal } from "@/lib/format";

// Drives joined into trips: a stop shorter than STOP_MS (a shop, a pickup) keeps going on the same trip,
// unless the car charged in it (see Drive.chargedBefore); the charge then shows on its own between them.
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
    // A charge between two drives ends the trip: its battery would otherwise read the charge as driving.
    if (last && !d.chargedBefore && d.start - last.at(-1)!.end < STOP_MS) last.push(d);
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

// The trip as it is shown: each leg's km and kWh rounded together with the trip's (see shownTotal), so
// the legs add up to the trip's Distance and Energy used to the last digit. For display only: a speed or
// a rate is worked out from the trip itself.
export function shownTrip(trip: Trip): Trip {
  const km = shownTotal(
    trip.legs.map((d) => d.km),
    DECIMALS.km,
  );
  const kwh = trip.kwh === null ? null : shownTotal(trip.legs.map((d) => d.kwh), DECIMALS.kWh);
  return {
    ...trip,
    km: km.total,
    kwh: kwh?.total ?? null,
    legs: trip.legs.map((d, k) => ({ ...d, km: km.parts[k]!, kwh: kwh ? kwh.parts[k] : d.kwh })),
  };
}

// A list of trips as shown, with the totals over them: the trips' km and kWh each rounded together, so the
// rows add up to the totals. `kwh` is null when any trip's energy is unknown, so a total never leaves one out.
export function shownTrips(trips: Trip[]): { trips: Trip[]; km: number; kwh: number | null } {
  const km = shownTotal(
    trips.map((t) => t.km),
    DECIMALS.km,
  );
  const kwh = shownTotal(
    trips.map((t) => t.kwh),
    DECIMALS.kWh,
  );
  return {
    trips: trips.map((t, k) => ({ ...t, km: km.parts[k]!, kwh: kwh.parts[k] })),
    km: km.total,
    kwh: trips.every((t) => t.kwh !== null) ? kwh.total : null,
  };
}
