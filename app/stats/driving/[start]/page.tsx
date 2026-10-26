import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { ChartCard } from "@/components/chart-card";
import { DriveTrace } from "@/components/stats/drive-lanes";
import { type Figure, Figures } from "@/components/stats/figures";
import { type MapFact, MapFacts, type MapPin, TripMap } from "@/components/stats/trip-map";
import { TripTimeline } from "@/components/stats/trip-timeline";
import { formatCelsius, formatClock, formatDate, formatDuration, formatKm, formatKw, formatNumber, formatKwh, formatLevels, formatRangeKm, formatSpeed } from "@/lib/format";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DriveDetail, loadDriveDetail } from "@/lib/server/drive-detail";
import { placeKey, placeNames } from "@/lib/server/place-names";
import { loadUserPlaces } from "@/lib/server/user-places";
import { NamePlace } from "@/components/name-place";
import { needsName, type SpotName, spotName } from "@/lib/charge-names";
import { stationAt } from "@/lib/stations";
import type { UserPlace } from "@/lib/user-places";
import { Measure } from "@/components/measure";

export const metadata: Metadata = { title: "Trip" };


// Acceleration as speed gained or lost each second, which reads better than the car's m/s²: 1 m/s² is
// 3.6 km/h each second.
const ACCEL_UNIT = "km/h per second";
const MS2_TO_KMHS = 3.6;
// The battery chart shows only when the level fell by at least this many points; otherwise its tile says it.
const BATTERY_CHART_POINTS = 10;

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(start: number, leg: boolean): Promise<DriveDetail | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadDriveDetail(owner, start, Date.now(), leg);
}

// One trip on one page: a single drive, or drives with short stops between (see groupTrips). Its totals,
// the route on a map with its start, stops and end, a timeline of legs and stops, then the battery and
// speed across the whole trip.
function Drive({ detail }: { detail: DriveDetail }) {
  const { battery, speed, rangeUsedKm, topKmh, outsideC, route, pins, accel, power, grade } = detail;
  // The trip's totals are its legs' raw sums, each rounded on its own when shown.
  const { trip } = detail;
  const drivingMs = trip.legs.reduce((sum, d) => sum + (d.end - d.start), 0);
  const stoppedMs = trip.end - trip.start - drivingMs;
  // The time it took, with the driving and stopped parts under it when there were stops.
  const took = formatDuration((trip.end - trip.start) / 1000);
  const split = trip.stops > 0 ? `${formatDuration(drivingMs / 1000)} driving · ${trip.stops === 1 ? "1 stop" : `${trip.stops} stops`}, ${formatDuration(stoppedMs / 1000)}` : undefined;
  const tiles: { label: string; value: string; note?: string; level?: [number, number] }[] = [
    { label: "Distance", value: formatKm(trip.km) },
    { label: "Took", value: took, note: split },
    ...(trip.kwh !== null ? [{ label: "Energy used", value: formatKwh(trip.kwh) }] : []),
    ...(trip.startLevel !== null && trip.endLevel !== null
      ? [{ label: "Battery", value: formatLevels(trip.startLevel, trip.endLevel), level: [trip.startLevel, trip.endLevel] as [number, number] }]
      : []),
    ...(rangeUsedKm !== null ? [{ label: "Range used", value: formatRangeKm(rangeUsedKm) }] : []),
    ...(drivingMs > 0 ? [{ label: "Average speed", value: formatSpeed(detail.trip.km / (drivingMs / 3_600_000)), note: trip.stops ? "while driving" : undefined }] : []),
    ...(topKmh !== null ? [{ label: "Top speed", value: formatSpeed(topKmh) }] : []),
    ...(outsideC !== null ? [{ label: "Outside", value: formatCelsius(outsideC) }] : []),
  ];
  // Every chart spans the drive and nothing else, so their time axes match and none runs past the end.
  const axis = { from: trip.start, to: trip.end, legs: trip.legs };
  const accelKmhs = accel.map((p) => ({ t: p.t, v: p.v * MS2_TO_KMHS }));
  const peaks = highlights(power, accelKmhs);
  const inDrive = battery.filter((p) => p.t <= trip.end);
  const levels = inDrive.map((p) => p.v);
  const batteryShown = levels.length >= 2 && Math.max(...levels) - Math.min(...levels) >= BATTERY_CHART_POINTS ? inDrive : [];
  return (
    <>
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">{trip.stops ? "Trip" : "Drive"}</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">
        {formatDate(trip.start)} · {formatClock(trip.start)} to {formatClock(trip.end)}
      </p>
      <div className="space-y-12">
        {/* Every number in one set of tiles: easier to take in than a long list. */}
        <section>
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
            label={trip.stops ? "this trip" : "this drive"}
            terms={trip.kwh !== null ? ["kWh"] : []}
          />
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-medium tracking-heading">Map</h2>
          {route.length >= 2 ? (
            <TripMap
              route={route}
              pins={mapPins(pins, trip.legs)}
              speed={speed}
              legs={trip.legs.map((d) => ({ start: d.start, end: d.end, note: [formatKm(d.km), batteryWords(d.startLevel, d.endLevel)].filter(Boolean).join(", ") }))}
              below={
                <Suspense fallback={<MapFacts facts={mapFacts(null, null, tiles)} />}>
                  <NamedFacts pins={pins} tiles={tiles} />
                </Suspense>
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">The map shows for trips after your car starts streaming its location.</p>
          )}
        </section>
        {trip.stops > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Timeline</h2>
            <TripTimeline legs={trip.legs} />
          </section>
        )}
        {trip.stops > 0 && <Legs legs={trip.legs} />}
        {[speed, power, accel, grade].some((points) => points.length >= 2) && (
          <section className="space-y-10">
            <div className="space-y-1">
              <h2 className="text-lg font-medium tracking-heading">Over the drive</h2>
              <p className="text-sm text-muted-foreground">
                What the car sent, {formatClock(trip.start)} to {formatClock(trip.end)}.{trip.stops > 0 && " Gaps are stops."}
              </p>
            </div>
            {speed.length >= 2 && (
              <ChartCard as="h3" title="Speed" description="How fast the car went.">
                <DriveTrace label="Speed" points={speed} unit="km/h" {...axis} />
              </ChartCard>
            )}
            {power.length >= 2 && (
              <ChartCard
                as="h3"
                title="Power"
                description="Power drawn from the battery. Below zero is regen."
                unit="kW"
                terms={["regen"]}
                summary={<Figures figures={peaks.power} />}
              >
                <DriveTrace label="Power" points={power} unit="kW" signed {...axis} />
              </ChartCard>
            )}
            {accel.length >= 2 && (
              <ChartCard
                as="h3"
                title="Acceleration"
                description="Speeding up above zero, braking below."
                unit={ACCEL_UNIT}
                summary={<Figures figures={peaks.accel} />}
              >
                <DriveTrace label="Acceleration" points={accelKmhs} unit={ACCEL_UNIT} signed digits={1} {...axis} />
              </ChartCard>
            )}
            {grade.length >= 2 && (
              <ChartCard
                as="h3"
                title="Road grade"
                description="Uphill above zero, downhill below."
                terms={["grade"]}
              >
                <DriveTrace label="Road grade" points={grade} unit="%" signed digits={1} {...axis} />
              </ChartCard>
            )}
            {/* Battery barely moves on a short drive, and the Battery tile above already says "70% to 69%". A flat
                line adds nothing, so the chart only shows when the level fell by BATTERY_CHART_POINTS or more. */}
            {batteryShown.length >= 2 && (
              <ChartCard as="h3" title="Battery level" description="Charge left as the drive went on.">
                <DriveTrace label="Battery level" points={batteryShown} unit="%" max={100} {...axis} />
              </ChartCard>
            )}
          </section>
        )}
        {(topKmh === null || outsideC === null || accel.length < 2) && (
          <p className="text-xs text-faint">Speed, acceleration and outside temperature show once your car streams them.</p>
        )}
      </div>
    </>
  );
}

const batteryWords = (a: number | null, b: number | null) => (a !== null && b !== null ? `Battery ${formatLevels(a, b)}` : null);

// A stop where the battery came back up between legs was a charge: its pin says so, with the levels.
function mapPins(pins: MapPin[], legs: DriveDetail["trip"]["legs"]): MapPin[] {
  return pins.map((p) => {
    // Stop pins are labelled "Stop 1 · ..." in order, the first between legs 1 and 2.
    const k = Number(/^Stop (\d+)/.exec(p.label)?.[1] ?? 0) - 1;
    const [before, after] = [legs[k], legs[k + 1]];
    if (p.kind !== "stop" || k < 0 || !before || !after || before.endLevel === null || after.startLevel === null || after.startLevel <= before.endLevel) return p;
    return { ...p, kind: "charge", note: `Charged ${formatLevels(before.endLevel, after.startLevel)}` };
  });
}

// The trip's facts under its map, from the tiles above, with where it began and ended when known. They sit
// on the map's card, each end with its best name (see spotName), and "Name this place" or a
// rename beside it.
function endFact(label: string, end: SpotName | null): MapFact | null {
  if (!end) return null;
  const action = needsName(end.name) ? <NamePlace target={end.target} /> : end.target.tag ? <NamePlace target={end.target} compact /> : undefined;
  if (!end.name && !action) return null;
  return { label, value: end.name?.text ?? "Unknown", extra: action };
}

function mapFacts(from: SpotName | null, to: SpotName | null, tiles: { label: string; value: string }[]): MapFact[] {
  const tile = (label: string) => tiles.find((t) => t.label === label)?.value;
  const facts: (MapFact | null)[] = [
    endFact("From", from),
    endFact("To", to),
    { label: "Distance", value: tile("Distance") ?? "" },
    { label: "Took", value: tile("Took") ?? "" },
    tile("Battery") ? { label: "Battery", value: tile("Battery")! } : null,
  ];
  return facts.filter((f): f is MapFact => f !== null && f.value !== "");
}

// The owner's names for places, in the same private cache as the page's data.
async function loadTags(): Promise<UserPlace[]> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return loadUserPlaces(owner);
}

// Names for the start and end, best source first (see spotName): the owner's tag, a charging station, then
// the area name Uplink keeps (looked up once each, see lib/server/place-names). Streams in after the map, so
// a slow lookup never holds the page.
async function NamedFacts({ pins, tiles }: { pins: MapPin[]; tiles: { label: string; value: string }[] }) {
  const ends = [pins.find((p) => p.kind === "start"), pins.findLast((p) => p.kind === "end")];
  const [names, tags] = await Promise.all([
    placeNames(ends.filter((p): p is MapPin => p !== undefined)).catch(() => new Map<string, string>()),
    loadTags(),
  ]);
  const name = (p: MapPin | undefined) => (p ? spotName(tags, p, { station: stationAt(p.lat, p.lng), place: names.get(placeKey(p)) }) : null);
  return <MapFacts facts={mapFacts(name(ends[0]), name(ends[1]), tiles)} />;
}

// Each leg of a trip as a row: when, how far, the energy and battery when known. Each opens its own page.
function Legs({ legs }: { legs: DriveDetail["trip"]["legs"] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Legs</h2>
      <div className="-mx-3 overflow-x-auto">
        <table className="w-full min-w-md text-sm tabular-nums [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              <th scope="col" className="w-10 py-2 pr-3 font-normal">#</th>
              <th scope="col" className="py-2 pr-4 font-normal">Leg</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Distance</th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">Energy</th>
              <th scope="col" className="py-2 text-right font-normal">Battery</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {legs.map((d, k) => (
              <tr key={d.start} className="relative cursor-pointer transition-colors duration-150 hover:bg-muted focus-within:bg-muted">
                <td className="py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
                <th scope="row" className="py-3 pr-4 text-left font-normal whitespace-nowrap">
                  <Link href={`/stats/driving/${d.start}?leg`} className="outline-none after:absolute after:inset-0">
                    {formatClock(d.start)} to {formatClock(d.end)}
                  </Link>
                </th>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap"><Measure text={formatKm(d.km)} /></td>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap">{d.kwh !== null ? <Measure text={formatKwh(d.kwh)} /> : <span className="text-faint">—</span>}</td>
                <td className="py-3 text-right whitespace-nowrap text-muted-foreground">
                  {d.startLevel !== null && d.endLevel !== null ? formatLevels(d.startLevel, d.endLevel) : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The peaks worth knowing, with when, shown beside their charts: the most power drawn and won back by
// regen, the strongest push and the hardest stop. Acceleration comes in km/h per second (see ACCEL_UNIT).
function highlights(power: { t: number; v: number }[], accel: { t: number; v: number }[]): { power: Figure[]; accel: Figure[] } {
  const peak = (points: { t: number; v: number }[], sign: 1 | -1) =>
    points.length === 0 ? null : points.reduce((a, p) => (p.v * sign > a.v * sign ? p : a));
  const figure = (label: string, p: { t: number; v: number } | null, sign: 1 | -1, value: (v: number) => string, note = "At") =>
    p && p.v * sign > 0 ? [{ label, value: value(p.v * sign), note: `${note} ${formatClock(p.t)}` }] : [];
  // Acceleration tiles say "8.8 km/h" with "Gained in one second" under it: the full unit doesn't fit a
  // tile on a phone, and the note reads more plainly anyway.
  return {
    power: [...figure("Most power", peak(power, 1), 1, formatKw), ...figure("Most regen", peak(power, -1), -1, formatKw)],
    accel: [
      ...figure("Hardest acceleration", peak(accel, 1), 1, (v) => `${formatNumber(v, 1)} km/h`, "Gained in one second, at"),
      ...figure("Hardest braking", peak(accel, -1), -1, (v) => `${formatNumber(v, 1)} km/h`, "Lost in one second, at"),
    ],
  };
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
