import Link from "next/link";
import { ShowMore } from "@/components/show-more";
import type { Drive } from "@/lib/drives";
import { groupTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

// Names the drive list's columns, on the same grid as its rows.
export function DriveHeader() {
  return (
    <div className="grid grid-cols-session-wide gap-x-4 pb-2 text-xs text-faint" aria-hidden="true">
      <span>Date</span>
      <span>Trip</span>
      <span className="text-right">Energy · battery</span>
      <span />
    </div>
  );
}

export function DriveRow({ drive, serial, now }: { drive: Drive; serial: number; now: number }) {
  const levels =
    drive.startLevel !== null && drive.endLevel !== null ? `${Math.round(drive.startLevel)}% to ${Math.round(drive.endLevel)}%` : null;
  return (
    <li className="relative grid grid-cols-session-wide items-start gap-x-4 py-4 text-sm">
      <p className="tabular-nums">{formatDayLabel(drive.start, now)}</p>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium tabular-nums">
          <span className="mr-2 font-mono text-xs font-normal text-faint">#{serial}</span>
          <Link href={`/stats/driving/${drive.start}`} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4">
            {formatClock(drive.start)} to {formatClock(drive.end)}
          </Link>
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {formatKm(drive.km)} · {formatDuration((drive.end - drive.start) / 1000)}
        </p>
      </div>
      <div className="space-y-1 text-right">
        {drive.kwh !== null && <p className="font-mono font-medium tabular-nums">{formatKwh(drive.kwh)}</p>}
        {levels && <p className="text-xs text-muted-foreground tabular-nums">{levels}</p>}
      </div>
      <div />
    </li>
  );
}

// A trip of several legs with short stops between (see groupTrips): the trip's totals, linking to the
// whole trip's page, then each leg, which opens its own.
export function TripRow({ trip, serial, now }: { trip: Trip; serial: number; now: number }) {
  if (trip.legs.length === 1) return <DriveRow drive={trip.legs[0]} serial={serial} now={now} />;
  const levels = trip.startLevel !== null && trip.endLevel !== null ? `${Math.round(trip.startLevel)}% to ${Math.round(trip.endLevel)}%` : null;
  return (
    <li className="grid grid-cols-session-wide items-start gap-x-4 py-4 text-sm">
      <p className="tabular-nums">{formatDayLabel(trip.start, now)}</p>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium tabular-nums">
          <span className="mr-2 font-mono text-xs font-normal text-faint">#{serial}</span>
          <Link href={`/stats/driving/${trip.start}`} className="hover:underline hover:underline-offset-4">
            {formatClock(trip.start)} to {formatClock(trip.end)}
          </Link>
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {formatKm(trip.km)} · {formatDuration((trip.end - trip.start) / 1000)} · {trip.stops} {trip.stops === 1 ? "stop" : "stops"}
        </p>
        <ul className="mt-2 space-y-1 border-l pl-3 text-xs text-muted-foreground tabular-nums">
          {trip.legs.map((d) => (
            <li key={d.start} className="flex justify-between gap-3">
              <Link href={`/stats/driving/${d.start}?leg`} className="hover:text-foreground hover:underline hover:underline-offset-4">
                {formatClock(d.start)} to {formatClock(d.end)} · {formatKm(d.km)}
              </Link>
              {d.kwh !== null && <span className="font-mono">{formatKwh(d.kwh)}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1 text-right">
        {trip.kwh !== null && <p className="font-mono font-medium tabular-nums">{formatKwh(trip.kwh)}</p>}
        {levels && <p className="text-xs text-muted-foreground tabular-nums">{levels}</p>}
      </div>
      <div />
    </li>
  );
}

// Trips from the last 90 days, newest first: drives with stops under an hour between them are one trip
// (see groupTrips). The latest few, then the rest behind Show more. Numbers count from the oldest trip.
export function DriveList({ drives, now }: { drives: Drive[]; now: number }) {
  if (drives.length === 0) return null;
  const trips = groupTrips(drives);
  const totalKm = drives.reduce((sum, d) => sum + d.km, 0);
  const rows = (list: Trip[], offset: number) =>
    list.map((t, i) => <TripRow key={t.start} trip={t} serial={trips.length - offset - i} now={now} />);
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
        <h2 className="font-medium">Trips</h2>
        <p className="tabular-nums">
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {drives.length} {drives.length === 1 ? "drive" : "drives"} · {formatKm(totalKm)}
        </p>
      </div>
      {/* On phones the list keeps its columns and scrolls sideways. */}
      <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
        <div className="max-sm:min-w-xl">
          <DriveHeader />
          <ul className="divide-y border-t">{rows(trips.slice(0, LIST_PREVIEW), 0)}</ul>
          {trips.length > LIST_PREVIEW && (
            <ShowMore count={trips.length - LIST_PREVIEW}>
              <ul className="divide-y border-t">{rows(trips.slice(LIST_PREVIEW), LIST_PREVIEW)}</ul>
            </ShowMore>
          )}
        </div>
      </div>
    </section>
  );
}
