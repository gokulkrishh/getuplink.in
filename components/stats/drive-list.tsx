import { ShowMore } from "@/components/show-more";
import { type TripRow, TripRows } from "@/components/stats/trip-rows";
import type { Drive } from "@/lib/drives";
import { groupTrips, shownTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

// A trip's texts for the table (see TripRows). How much of the battery it took is "9%", with the start and
// end levels as its title; neither when a level is unknown.
function tripRow(trip: Trip, serial: number, now: number): TripRow {
  const levels = trip.startLevel !== null && trip.endLevel !== null ? [Math.round(trip.startLevel), Math.round(trip.endLevel)] : null;
  return {
    start: trip.start,
    serial,
    day: formatDayLabel(trip.start, now),
    times: `${formatClock(trip.start)} to ${formatClock(trip.end)}`,
    km: formatKm(trip.km),
    duration: formatDuration((trip.end - trip.start) / 1000),
    stops: trip.stops > 0 ? `${trip.stops} ${trip.stops === 1 ? "stop" : "stops"}` : null,
    kwh: trip.kwh === null ? null : formatKwh(trip.kwh),
    used: levels && `${Math.max(0, levels[0] - levels[1])}%`,
    levels: levels && `${levels[0]}% to ${levels[1]}%`,
  };
}

// Trips as a plain table: number, date, times, distance with the time it took, and energy with the battery
// it used. On a phone, a list of two-line rows instead. `header` is off for a continuation behind Show more.
// The browser draws the rows from their texts (see TripRows), so a long list costs the page little.
export function TripTable({ trips, serialOf, now, header = true }: { trips: Trip[]; serialOf: (trip: Trip) => number; now: number; header?: boolean }) {
  return <TripRows rows={trips.map((t) => tripRow(t, serialOf(t), now))} header={header} />;
}

// Trips from the last 90 days, newest first: drives with stops under an hour between them are one trip
// (see groupTrips). The latest few, then the rest behind Show more. Numbers count from the oldest trip in
// `all`, so a list cut to a range keeps each trip's number.
export function DriveList({ drives, all = drives, now }: { drives: Drive[]; all?: Drive[]; now: number }) {
  if (drives.length === 0) return null;
  // Each trip's km rounded with the total over them (see shownTrips), so the rows add up to it as shown.
  const { trips, km: totalKm } = shownTrips(groupTrips(drives));
  const numbered = all === drives ? trips : groupTrips(all);
  const serialOf = (t: Trip) => numbered.length - numbered.findIndex((n) => n.start === t.start);
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-heading">Trips</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {drives.length} {drives.length === 1 ? "drive" : "drives"} · {formatKm(totalKm)}
        </p>
      </div>
      <TripTable trips={trips.slice(0, LIST_PREVIEW)} serialOf={serialOf} now={now} />
      {trips.length > LIST_PREVIEW && (
        <ShowMore count={trips.length - LIST_PREVIEW}>
          <TripTable trips={trips.slice(LIST_PREVIEW)} serialOf={serialOf} now={now} header={false} />
        </ShowMore>
      )}
    </section>
  );
}
