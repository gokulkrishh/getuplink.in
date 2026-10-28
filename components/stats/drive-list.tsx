import { type TripRow, TripRows } from "@/components/stats/trip-rows";
import type { Drive } from "@/lib/drives";
import { groupTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { type LoadMore, LIST_PREVIEW, paged } from "@/lib/list";

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

// The trips as table rows, newest first and numbered from 1. The browser draws them from their texts (see
// TripRows). `routes`: where each trip went, by its start (lib/server/trip-places.ts).
export function tripRows(trips: Trip[], now: number, routes: Record<number, string> = {}): TripRow[] {
  return trips.map((t, k) => tripRow(t, k + 1, now, routes[t.start] ?? null));
}

// Trips from the last 90 days, newest first: drives with stops under an hour between them are one trip
// (see groupTrips). The latest few, then the rest from `more` (bound to the period) on Show more.
export function DriveList({ drives, now, routes, more }: { drives: Drive[]; now: number; routes?: Record<number, string>; more: LoadMore<TripRow> }) {
  if (drives.length === 0) return null;
  // No km total here: the Distance chart has it from the odometer, which also counts moves too short to be
  // a drive, so a sum of these would disagree with it.
  const trips = groupTrips(drives);
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Trips</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {drives.length} {drives.length === 1 ? "drive" : "drives"}
        </p>
      </div>
      <TripRows list={paged(tripRows(trips, now, routes), LIST_PREVIEW)} load={more} />
    </section>
  );
}
