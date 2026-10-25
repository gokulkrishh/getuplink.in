import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { ShowMore } from "@/components/show-more";
import type { Drive } from "@/lib/drives";
import { groupTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

// Names the drive list's columns, on the same grid as its rows.
export function DriveHeader() {
  return (
    <div className="grid grid-cols-drive gap-x-4 pb-2 text-xs text-faint" aria-hidden="true">
      <span>Date</span>
      <span>Trip</span>
      <span className="text-right">Distance</span>
      <span className="text-right">Energy</span>
    </div>
  );
}

function levels(start: number | null, end: number | null): string | null {
  return start !== null && end !== null ? `${Math.round(start)}% to ${Math.round(end)}%` : null;
}

// The row's first line: its number, then the times, as the link that covers the whole row.
function Title({ serial, start, end }: { serial: number; start: number; end: number }) {
  return (
    <p className="truncate font-medium tabular-nums">
      <span className="mr-2 font-mono text-xs font-normal text-faint">#{serial}</span>
      <Link href={`/stats/driving/${start}`} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4">
        {formatClock(start)} to {formatClock(end)}
      </Link>
    </p>
  );
}

// Distance, then the energy used with the battery's start and end level under it (each only when known).
function Figures({ km, kwh, level }: { km: number; kwh: number | null; level: string | null }) {
  return (
    <>
      <p className="text-right font-mono font-medium whitespace-nowrap tabular-nums">{formatKm(km)}</p>
      <div className="space-y-1 text-right">
        {kwh === null ? (
          <p className="text-faint">—</p>
        ) : (
          <p className="font-mono font-medium whitespace-nowrap tabular-nums">{formatKwh(kwh)}</p>
        )}
        {level && <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{level}</p>}
      </div>
    </>
  );
}

export function DriveRow({ drive, serial, now }: { drive: Drive; serial: number; now: number }) {
  return (
    <li className="relative grid grid-cols-drive items-start gap-x-4 py-4 text-sm">
      <p className="tabular-nums">{formatDayLabel(drive.start, now)}</p>
      <div className="min-w-0 space-y-1">
        <Title serial={serial} start={drive.start} end={drive.end} />
        <p className="truncate text-xs text-muted-foreground tabular-nums">{formatDuration((drive.end - drive.start) / 1000)}</p>
      </div>
      <Figures km={drive.km} kwh={drive.kwh} level={levels(drive.startLevel, drive.endLevel)} />
    </li>
  );
}

// A trip of several legs with short stops between (see groupTrips): the trip's totals, linking to the
// whole trip's page, then each leg behind a toggle at the end of the second line, which opens its own.
// The summary lets taps through to the row's link except on "3 legs" itself (a tap on a summary's
// child still toggles it).
export function TripRow({ trip, serial, now }: { trip: Trip; serial: number; now: number }) {
  if (trip.legs.length === 1) return <DriveRow drive={trip.legs[0]} serial={serial} now={now} />;
  return (
    <li className="relative grid grid-cols-drive items-start gap-x-4 py-4 text-sm">
      <p className="tabular-nums">{formatDayLabel(trip.start, now)}</p>
      <div className="min-w-0 space-y-1">
        <Title serial={serial} start={trip.start} end={trip.end} />
        <details className="group">
          <summary className="pointer-events-none relative z-10 flex w-fit max-w-full cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="truncate">
              {formatDuration((trip.end - trip.start) / 1000)} · {trip.stops} {trip.stops === 1 ? "stop" : "stops"} ·
            </span>
            <span className="pointer-events-auto flex shrink-0 items-center gap-0.5 text-foreground hover:underline hover:underline-offset-4">
              {trip.legs.length} legs
              <ChevronDown aria-hidden="true" className="size-3 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <ul className="relative z-10 mt-2 w-fit max-w-full space-y-1 border-l pl-3 text-xs text-muted-foreground tabular-nums">
            {trip.legs.map((d) => (
              <li key={d.start} className="truncate">
                <Link href={`/stats/driving/${d.start}?leg`} className="hover:text-foreground hover:underline hover:underline-offset-4">
                  {formatClock(d.start)} to {formatClock(d.end)}
                </Link>
                {" · "}
                {formatKm(d.km)}
                {d.kwh !== null && ` · ${formatKwh(d.kwh)}`}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <Figures km={trip.km} kwh={trip.kwh} level={levels(trip.startLevel, trip.endLevel)} />
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
