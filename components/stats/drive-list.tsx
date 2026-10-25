import Link from "next/link";
import { ShowMore } from "@/components/show-more";
import type { Drive } from "@/lib/drives";
import { groupTrips, type Trip } from "@/lib/trips";
import { formatClock, formatDayLabel, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { LIST_PREVIEW } from "@/lib/list";

// The trip table's columns. Fixed widths, so a second table (behind Show more) lines up with the first.
const COLUMNS = [
  { label: "#", width: "w-10" },
  { label: "Date", width: "w-24" },
  { label: "Trip", width: "" },
  { label: "Duration", width: "w-28" },
  { label: "Distance", width: "w-20", right: true },
  { label: "Energy", width: "w-24", right: true },
  { label: "Battery used", width: "w-28", right: true },
];

// How much of the battery a trip took: "9%", with the start and end levels as its title. Null when either
// level is unknown.
function batteryUsed(start: number | null, end: number | null): { used: string; levels: string } | null {
  if (start === null || end === null) return null;
  return { used: `${Math.max(0, Math.round(start) - Math.round(end))}%`, levels: `${Math.round(start)}% to ${Math.round(end)}%` };
}

const faint = <span className="text-faint">—</span>;

// One trip (a single drive, or drives with short stops between; see groupTrips) as a row. The times link to
// its page, which lists the legs; the link covers the row, which highlights on hover or focus.
function TripTableRow({ trip, serial, now }: { trip: Trip; serial: number; now: number }) {
  const battery = batteryUsed(trip.startLevel, trip.endLevel);
  return (
    <tr className="relative cursor-pointer transition-colors duration-150 hover:bg-muted focus-within:bg-muted">
      <td className="py-3 pr-3 font-mono text-xs text-faint">{serial}</td>
      <td className="py-3 pr-3 whitespace-nowrap">{formatDayLabel(trip.start, now)}</td>
      <th scope="row" className="truncate py-3 pr-3 text-left font-medium">
        <Link href={`/stats/driving/${trip.start}`} className="outline-none after:absolute after:inset-0">
          {formatClock(trip.start)} to {formatClock(trip.end)}
        </Link>
      </th>
      <td className="py-3 pr-3 whitespace-nowrap">
        {formatDuration((trip.end - trip.start) / 1000)}
        {trip.stops > 0 && (
          <span className="block text-xs text-muted-foreground">
            {trip.stops} {trip.stops === 1 ? "stop" : "stops"}
          </span>
        )}
      </td>
      <td className="py-3 pr-3 text-right font-mono whitespace-nowrap">{formatKm(trip.km)}</td>
      <td className="py-3 pr-3 text-right font-mono whitespace-nowrap">{trip.kwh === null ? faint : formatKwh(trip.kwh)}</td>
      <td className="py-3 text-right font-mono whitespace-nowrap" title={battery?.levels}>
        {battery ? battery.used : faint}
      </td>
    </tr>
  );
}

// Trips as a plain table: number, date, times, duration, distance, energy and battery used. On a phone it
// keeps its columns and scrolls sideways. `header` is off for a continuation behind Show more.
export function TripTable({ trips, serialOf, now, header = true }: { trips: Trip[]; serialOf: (trip: Trip) => number; now: number; header?: boolean }) {
  return (
    <div className="max-sm:-mx-1 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1">
      <table className="w-full table-fixed text-sm tabular-nums max-sm:min-w-2xl">
        <colgroup>
          {COLUMNS.map((c) => (
            <col key={c.label} className={c.width} />
          ))}
        </colgroup>
        {header && (
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className={`pb-2 pr-3 font-normal last:pr-0 ${c.right ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className={`divide-y ${header ? "" : "border-t"}`}>
          {trips.map((t) => (
            <TripTableRow key={t.start} trip={t} serial={serialOf(t)} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Trips from the last 90 days, newest first: drives with stops under an hour between them are one trip
// (see groupTrips). The latest few, then the rest behind Show more. Numbers count from the oldest trip.
export function DriveList({ drives, now }: { drives: Drive[]; now: number }) {
  if (drives.length === 0) return null;
  const trips = groupTrips(drives);
  const totalKm = drives.reduce((sum, d) => sum + d.km, 0);
  const serialOf = (t: Trip) => trips.length - trips.indexOf(t);
  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 text-xs tracking-wide text-faint uppercase">
        <h2 className="font-medium">Trips</h2>
        <p className="tabular-nums">
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
