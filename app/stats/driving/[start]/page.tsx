import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { DriveLanes } from "@/components/stats/drive-lanes";
import { type Figure, Figures } from "@/components/stats/figures";
import { TripMap } from "@/components/stats/trip-map";
import { TripTimeline } from "@/components/stats/trip-timeline";
import { formatClock, formatDate, formatDuration, formatKm, formatKwh } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DriveDetail, loadDriveDetail } from "@/lib/server/drive-detail";

export const metadata: Metadata = { title: "Trip · Uplink" };

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(start: number, leg: boolean): Promise<DriveDetail | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadDriveDetail(start, Date.now(), leg);
}

// One trip on one page: a single drive, or drives with short stops between (see groupTrips). Its totals,
// the route on a map with its start, stops and end, a timeline of legs and stops, then the battery and
// speed across the whole trip.
function Drive({ detail }: { detail: DriveDetail }) {
  const { trip, battery, speed, rangeUsedKm, topKmh, outsideC, route, pins, accel, power, grade } = detail;
  const drivingMs = trip.legs.reduce((sum, d) => sum + (d.end - d.start), 0);
  const stoppedMs = trip.end - trip.start - drivingMs;
  const tiles: { label: string; value: string; note?: string; level?: [number, number] }[] = [
    ...(trip.kwh !== null ? [{ label: "Energy used", value: formatKwh(trip.kwh) }] : []),
    ...(trip.startLevel !== null && trip.endLevel !== null
      ? [{ label: "Battery", value: `${Math.round(trip.startLevel)}% to ${Math.round(trip.endLevel)}%`, level: [trip.startLevel, trip.endLevel] as [number, number] }]
      : []),
    ...(rangeUsedKm !== null ? [{ label: "Range used", value: `${Math.round(rangeUsedKm)} km` }] : []),
    ...(drivingMs > 0 ? [{ label: "Average speed", value: `${Math.round(trip.km / (drivingMs / 3_600_000))} km/h`, note: trip.stops ? "while driving" : undefined }] : []),
    ...(topKmh !== null ? [{ label: "Top speed", value: `${Math.round(topKmh)} km/h` }] : []),
    ...(outsideC !== null ? [{ label: "Outside", value: `${oneDecimal.format(outsideC)} °C` }] : []),
  ];
  const summary = [
    { label: trip.stops ? "In all" : "Took", value: formatDuration((trip.end - trip.start) / 1000) },
    trip.stops > 0 && { label: "Driving", value: formatDuration(drivingMs / 1000) },
    trip.stops > 0 && { label: trip.stops === 1 ? "1 stop" : `${trip.stops} stops`, value: formatDuration(stoppedMs / 1000) },
  ];
  const traceEnd = Math.max(trip.end, battery.at(-1)?.t ?? trip.end);
  return (
    <>
      <h1 className="text-2xl font-medium tracking-heading">{trip.stops ? "Trip" : "Drive"}</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">
        {formatDate(trip.start)} · {formatClock(trip.start)} to {formatClock(trip.end)}
      </p>
      <div className="space-y-12">
        {/* The headline, then a few numbers as tiles: easier to take in than a long list. */}
        <section className="space-y-6">
          <div className="space-y-3">
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">{formatKm(trip.km)}</p>
            <Figures figures={summary} />
          </div>
          <Figures
            figures={tiles.map(({ level, ...t }) => ({
              ...t,
              extra: level && (
                <div className="relative h-1 bg-muted" aria-hidden="true">
                  <div className="absolute inset-y-0 left-0 bg-muted-foreground/40" style={{ width: `${level[0]}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-chart-accent" style={{ width: `${level[1]}%` }} />
                </div>
              ),
            }))}
          />
        </section>
        <section className="space-y-4">
          <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Map</h2>
          {route.length >= 2 ? (
            <TripMap route={route} pins={pins} />
          ) : (
            <p className="text-sm text-muted-foreground">The map shows for trips after your car starts streaming its location.</p>
          )}
        </section>
        {trip.stops > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Timeline</h2>
            <TripTimeline legs={trip.legs} />
          </section>
        )}
        {trip.stops > 0 && <Legs legs={trip.legs} />}
        {[speed, power, accel, grade, battery].some((points) => points.length >= 2) && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Over the drive</h2>
            <Figures figures={highlights(power, accel)} />
            <DriveLanes
              from={trip.start}
              to={traceEnd}
              lanes={[
                { name: "Speed", unit: "km/h", points: speed },
                { name: "Power", unit: "kW", points: power, signed: true },
                { name: "Acceleration", unit: "m/s²", points: accel, signed: true },
                { name: "Road grade", unit: "%", points: grade, signed: true },
                { name: "Battery", unit: "%", points: battery, max: 100 },
              ]}
            />
            {grade.length >= 2 && <p className="text-xs text-faint">Power below zero is regen. Road grade is uphill above zero, as the car estimated it.</p>}
          </section>
        )}
        {(topKmh === null || outsideC === null || accel.length < 2) && (
          <p className="text-xs text-faint">Speed, acceleration and outside temperature show here for drives after your car starts streaming them.</p>
        )}
      </div>
    </>
  );
}

// Each leg of a trip as a row: when, how far, the energy and battery when known. Each opens its own page.
function Legs({ legs }: { legs: DriveDetail["trip"]["legs"] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-faint uppercase">Legs</h2>
      <div className="-mx-3 overflow-x-auto">
        <table className="w-full min-w-md text-sm tabular-nums [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              <th scope="col" className="py-2 pr-4 font-normal">Leg</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Distance</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Energy</th>
              <th scope="col" className="py-2 text-right font-normal">Battery</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {legs.map((d, k) => (
              <tr key={d.start} className="relative cursor-pointer transition-colors duration-150 hover:bg-muted focus-within:bg-muted">
                <th scope="row" className="py-3 pr-4 text-left font-normal whitespace-nowrap">
                  <span className="mr-2 font-mono text-xs text-faint">{k + 1}</span>
                  <Link href={`/stats/driving/${d.start}?leg`} className="outline-none after:absolute after:inset-0">
                    {formatClock(d.start)} to {formatClock(d.end)}
                  </Link>
                </th>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap">{formatKm(d.km)}</td>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap">{d.kwh !== null ? formatKwh(d.kwh) : <span className="text-faint">—</span>}</td>
                <td className="py-3 text-right whitespace-nowrap text-muted-foreground">
                  {d.startLevel !== null && d.endLevel !== null ? `${Math.round(d.startLevel)}% to ${Math.round(d.endLevel)}%` : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The peaks worth knowing, with when: the most power drawn and won back by regen, the strongest push and
// the hardest stop.
function highlights(power: { t: number; v: number }[], accel: { t: number; v: number }[]): Figure[] {
  const peak = (points: { t: number; v: number }[], sign: 1 | -1) =>
    points.length === 0 ? null : points.reduce((a, p) => (p.v * sign > a.v * sign ? p : a));
  const figure = (label: string, p: { t: number; v: number } | null, sign: 1 | -1, value: (v: number) => string) =>
    p && p.v * sign > 0 ? [{ label, value: value(p.v * sign), note: `At ${formatClock(p.t)}` }] : [];
  return [
    ...figure("Most power", peak(power, 1), 1, (v) => `${Math.round(v)} kW`),
    ...figure("Most regen", peak(power, -1), -1, (v) => `${Math.round(v)} kW`),
    ...figure("Hardest acceleration", peak(accel, 1), 1, (v) => `${oneDecimal.format(v)} m/s²`),
    ...figure("Hardest braking", peak(accel, -1), -1, (v) => `${oneDecimal.format(v)} m/s²`),
  ];
}

async function DriveLoader({ params, searchParams }: Pick<PageProps<"/stats/driving/[start]">, "params" | "searchParams">) {
  const [{ start }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{12,14}$/.test(start)) notFound();
  const detail = await loadDetail(Number(start), query.leg !== undefined);
  if (!detail) notFound();
  return <Drive detail={detail} />;
}

function DriveSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className={`h-8 w-48 ${block}`} />
      <div className={`h-64 w-full ${block}`} />
    </div>
  );
}

export default function Page({ params, searchParams }: PageProps<"/stats/driving/[start]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<DriveSkeleton />}>
        <DriveLoader params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
