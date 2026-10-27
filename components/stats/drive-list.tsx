import { type TripRow, TripRows } from "@/components/stats/trip-rows";
import type { Drive } from "@/lib/drives";
import { groupTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

// A trip's texts for the table (see TripRows). How much of the battery it took is "9%", with the start and
// end levels as its title; neither when a level is unknown.
function tripRow(trip: Trip, serial: number, now: number, route: string | null): TripRow {
  const levels = trip.startLevel !== null && trip.endLevel !== null ? [Math.round(trip.startLevel), Math.round(trip.endLevel)] : null;
  return {
    start: trip.start,
    serial,
    day: formatDayLabel(trip.start, now),
    times: `${formatClock(trip.start)} to ${formatClock(trip.end)}`,
    route,
    km: formatKm(trip.km),
    duration: formatDuration((trip.end - trip.start) / 1000),
    stops: trip.stops > 0 ? `${trip.stops} ${trip.stops === 1 ? "stop" : "stops"}` : null,
    kwh: trip.kwh === null ? null : formatKwh(trip.kwh),
    used: levels && `${Math.max(0, levels[0] - levels[1])}%`,
    levels: levels && `${levels[0]}% to ${levels[1]}%`,
  };
}

// Trips as a plain table: number, date, times, distance with the time it took, and energy with the battery
// it used. On a phone, a list of two-line rows instead. With `preview`, the rest wait behind "Show N more".
// The browser draws the rows from their texts (see TripRows), so a long list costs the page little.
// `routes`: where each trip went, by its start (lib/server/trip-places.ts).
export function TripTable({ trips, serialOf, now, preview, routes = {} }: { trips: Trip[]; serialOf: (trip: Trip) => number; now: number; preview?: number; routes?: Record<number, string> }) {
  return <TripRows rows={trips.map((t) => tripRow(t, serialOf(t), now, routes[t.start] ?? null))} preview={preview} />;
}

// Trips from the last 90 days, newest first: drives with stops under an hour between them are one trip
// (see groupTrips). The latest few, then the rest behind Show more. Numbered from the top row, 1.
export function DriveList({ drives, now, routes }: { drives: Drive[]; now: number; routes?: Record<number, string> }) {
  if (drives.length === 0) return null;
  // No km total here: the Distance chart has it from the odometer, which also counts moves too short to be
  // a drive, so a sum of these would disagree with it.
  const trips = groupTrips(drives);
  const serialOf = (t: Trip) => trips.indexOf(t) + 1;
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Trips</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {drives.length} {drives.length === 1 ? "drive" : "drives"}
        </p>
      </div>
      <TripTable trips={trips} serialOf={serialOf} now={now} preview={LIST_PREVIEW} routes={routes} />
    </section>
  );
}
