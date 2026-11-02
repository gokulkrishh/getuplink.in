import { TableBox } from "@/components/scroll-x";
import { AiNotes } from "@/components/home/week-tips";
import { DriveSkeleton } from "@/components/stats/skeletons";
import { loadTipsBox } from "@/components/tips-box";
import { DRIVE_TIPS, driveFindings, TRIP_TIPS } from "@/lib/drive-tips";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache, type ReactNode, Suspense } from "react";
import { Header, PhoneNav } from "@/components/header";
import { BackLink } from "@/components/stats/back-link";
import { ChartCard } from "@/components/chart-card";
import { ClimateTrace } from "@/components/stats/climate-trace";
import { DriveTrace, type Side } from "@/components/stats/drive-lanes";
import { climateLine, summariseClimate } from "@/lib/drive-climate";
import { type Figure, Figures } from "@/components/stats/figures";
import { type MapPin, TripMap } from "@/components/stats/trip-map";
import { TripTimeline } from "@/components/stats/trip-timeline";
import { formatCelsius, formatClock, formatDate, formatDuration, formatKm, formatKw, formatNumber, formatKwh, formatLevels, formatRangeKm, formatSpeed, withDayWord } from "@/lib/format";
import { requireReader } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { type DriveDetail, loadDriveDetail } from "@/lib/server/drive-detail";
import { cachedPlaceNames, placeKey, placeNames } from "@/lib/server/place-names";
import { loadUserPlaces } from "@/lib/server/user-places";
import { NamePlace } from "@/components/name-place";
import { ROW_LINK, RowChevron } from "@/components/row-chevron";
import { nameAction, shownName, type SpotName, spotName } from "@/lib/charge-names";
import { RouteCard, type RouteCardPlaces } from "@/components/stats/route-card";
import { withGoogleNames } from "@/lib/server/google-place-names";
import { isFlat, MIN_USUAL_DRIVES } from "@/lib/drive-verdict";
import { describeDrive, type DriveView, type WordingField } from "@/lib/drive-facts";
import { pickWords, type ShownLine } from "@/lib/drive-wording";
import { generateDriveWording, loadDriveWording } from "@/lib/server/drive-wording";
import { shownTo } from "@/lib/server/data/owner";
import { AiLine } from "@/components/ai-line";
import { stationAt } from "@/lib/stations";
import type { UserPlace } from "@/lib/user-places";
import { isDriveStart } from "@/lib/stats-paths";
import { Measure } from "@/components/measure";
import { TABLE_HEAD_ROW } from "@/lib/table-frame";

export const metadata: Metadata = { title: "Trip" };


// Acceleration as speed gained or lost each second, which reads better than the car's m/s²: 1 m/s² is
// 3.6 km/h each second.
const ACCEL_UNIT = "km/h per second";
const MS2_TO_KMHS = 3.6;
// Each signed trace coloured by what its sign means (see "Colour by meaning" in docs/charts.md), with the
// words the tooltip and legend use for each side.
const POWER_SIDES: { above: Side; below: Side } = { above: { tone: "cool", words: "Drawing" }, below: { tone: "charge", words: "Won back" } };
const ACCEL_SIDES: { above: Side; below: Side } = { above: { tone: "cool", words: "Speeding up" }, below: { tone: "warm", words: "Braking" } };
const GRADE_SIDES: { above: Side; below: Side } = { above: { tone: "warm", words: "Uphill" }, below: { tone: "cool", words: "Downhill" } };

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// Never the Owner itself: a private cache's result can reach the browser, and a guest must never get the
// owner's user id or Tesla account id. DriveLoader reads the reader again for the wording.
async function loadDetail(start: number, leg: boolean): Promise<{ detail: DriveDetail | null; now: number; locations: boolean }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  return { detail: await loadDriveDetail(owner, start, now, leg), now, locations: shownTo(owner).locations };
}

// One trip on one page: a single drive, or drives with short stops between (see groupTrips). Its totals,
// the route on a map with its start, stops and end, a timeline of legs and stops, then the battery and
// speed across the whole trip.
// `words` holds each line's text, the AI's or the code's (see lib/drive-facts.ts and lib/drive-wording.ts).
// `locations`: false for a view link that hides them, which leaves the map out, with no note in its place.
function Drive({ detail, view, words, tipsBox, now, locations }: { detail: DriveDetail; view: DriveView; words: Partial<Record<WordingField, ShownLine>>; tipsBox: ReactNode; now: number; locations: boolean }) {
  const { speed, rangeUsedKm, topKmh, outsideC, route, pins, accel, power, grade, climate } = detail;
  // The trip's totals are its legs' raw sums, each rounded on its own when shown.
  const { trip } = detail;
  const drivingMs = trip.legs.reduce((sum, d) => sum + (d.end - d.start), 0);
  const stoppedMs = trip.end - trip.start - drivingMs;
  // How far and how long, for the card at the top; on a trip, the stops and the time stopped too.
  const took = formatDuration((trip.end - trip.start) / 1000);
  const stops = trip.stops > 0 ? `${trip.stops === 1 ? "1 stop" : `${trip.stops} stops`}, ${formatDuration(stoppedMs / 1000)}` : null;
  // The numbers the card at the top doesn't show (it has the distance, the time, the battery and the energy).
  const tiles: { label: string; value: string; note?: string }[] = [
    ...(rangeUsedKm !== null ? [{ label: "Range used", value: formatRangeKm(rangeUsedKm) }] : []),
    ...(drivingMs > 0 ? [{ label: "Average speed", value: formatSpeed(detail.trip.km / (drivingMs / 3_600_000)), note: trip.stops ? "while driving" : undefined }] : []),
    ...(topKmh !== null ? [{ label: "Top speed", value: formatSpeed(topKmh) }] : []),
    ...(outsideC !== null ? [{ label: "Outside", value: formatCelsius(outsideC) }] : []),
  ];
  // Every chart spans the drive and nothing else, so their time axes match and none runs past the end.
  const axis = { from: trip.start, to: trip.end, legs: trip.legs };
  const accelKmhs = accel.map((p) => ({ t: p.t, v: p.v * MS2_TO_KMHS }));
  const peaks = highlights(power, accelKmhs);
  // Hard moments come from the car's own m/s² (see lib/drive-verdict.ts); the chart marks them in km/h
  // per second.
  const { moments, batteryShown } = view;
  const line = (field: WordingField) => (words[field] ? <AiLine line={words[field]} /> : null);
  const what = trip.stops ? "trip" : "drive";
  const wentTiles = howItWent(view.facts);
  // The route card under the title: places only when the trip has a start and an end to name.
  const routed = locations && pins.some((p) => p.kind === "start") && pins.some((p) => p.kind === "end");
  const card: RouteCardBase = {
    day: withDayWord(formatDate(trip.start), trip.start, now),
    start: formatClock(trip.start),
    end: formatClock(trip.end),
    between: [formatKm(trip.km), took, stops].filter(Boolean).join(" · "),
    // The battery, then the energy used, each when known.
    figures: [
      ...(trip.startLevel !== null && trip.endLevel !== null ? [{ label: "Battery", value: formatLevels(trip.startLevel, trip.endLevel) }] : []),
      ...(trip.kwh !== null ? [{ label: "Energy used", value: formatKwh(trip.kwh) }] : []),
    ],
  };
  return (
    <>
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">{trip.stops ? "Trip" : "Drive"}</h1>
      {/* Where and when it began and ended, as a card. The names stream in after the page; the card keeps its
          height while they do, so nothing moves when they land. */}
      {routed ? (
        <Suspense fallback={<RouteCard {...card} places="pending" />}>
          <NamedRoute pins={pins} card={card} />
        </Suspense>
      ) : (
        <RouteCard {...card} places="hidden" />
      )}
      <div className="space-y-12">
        {(wentTiles.length > 0 || tiles.length > 0) && (
          <section className="space-y-3">
            <h2 className="text-lg font-medium tracking-heading">How this {what} went</h2>
            {/* The figures from code; the AI adds only why, in one line, when it has written one. First the
                energy use and hard moments against the usual, then the rest of the numbers the card above
                doesn't show. */}
            <Figures figures={wentTiles} />
            <Figures figures={tiles} label={trip.stops ? "this trip" : "this drive"} />
            {words.summary?.ai && <AiNotes title="Summary" notes={[{ text: words.summary.text }]} />}
            {/* What to do, from this drive against the usual (lib/drive-tips.ts); no box with nothing to say. */}
            {tipsBox}
          </section>
        )}
        {locations && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Map</h2>
            {route.length >= 2 ? (
              <TripMap
                route={route}
                pins={mapPins(pins, trip.legs)}
                speed={speed}
                legs={trip.legs.map((d) => ({ start: d.start, end: d.end, note: [formatKm(d.km), batteryWords(d.startLevel, d.endLevel)].filter(Boolean).join(", ") }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">The map shows once your car starts sending its location.</p>
            )}
          </section>
        )}
        {trip.stops > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium tracking-heading">Timeline</h2>
            <TripTimeline legs={trip.legs} />
          </section>
        )}
        {trip.stops > 0 && <Legs legs={trip.legs} />}
        {([speed, power, accel, grade].some((points) => points.length >= 2) || climate) && (
          // Each chart is its own section: a heading over them all would only repeat the drive's times above.
          <div className="space-y-12">
            {speed.length >= 2 && (
              <ChartCard as="h2" title="Speed" description={line("speed")}>
                <DriveTrace label="Speed" points={speed} unit="km/h" {...axis} />
              </ChartCard>
            )}
            {/* Battery barely moves on a short drive, and the Battery tile above already says "70% to 69%". A flat
                line adds nothing, so the chart only shows when the level fell by BATTERY_CHART_POINTS or more. */}
            {batteryShown.length >= 2 && (
              <ChartCard as="h2" title="Battery level" description={line("battery")}>
                <DriveTrace label="Battery level" points={batteryShown} unit="%" max={100} {...axis} />
              </ChartCard>
            )}
            {power.length >= 2 && (
              <ChartCard
                as="h2"
                title="Power"
                description={line("power")}
                summary={<Figures figures={peaks.power} />}
              >
                <DriveTrace label="Power" points={power} unit="kW" signed split={POWER_SIDES} {...axis} />
              </ChartCard>
            )}
            {climate && (
              <ChartCard as="h2" title="Climate" description={climateLine(summariseClimate(climate))}>
                <ClimateTrace label="Climate" climate={climate} from={axis.from} to={axis.to} />
              </ChartCard>
            )}
            {accel.length >= 2 && (
              <ChartCard
                as="h2"
                title="Acceleration"
                description={line("acceleration")}
                // What a red dot is, in the owner's terms: the same line Tesla uses (see HARD_G).
                info={"A red dot is a hard stop or start: about 11\u00a0km/h lost or gained in one second. Tesla's Safety Score uses the same line for hard braking."}
                summary={<Figures figures={peaks.accel} />}
              >
                <DriveTrace
                  label="Acceleration"
                  points={accelKmhs}
                  unit={ACCEL_UNIT}
                  signed
                  digits={1}
                  split={ACCEL_SIDES}
                  marks={{ points: (moments ?? []).map((m) => ({ t: m.t, v: m.v * MS2_TO_KMHS })), words: "Hard" }}
                  {...axis}
                />
              </ChartCard>
            )}
            {grade.length >= 2 && (
              <ChartCard
                as="h2"
                title="Road grade"
                description={line("grade")}
                info="A climb or descent is a slope that lasts at least half a minute. Shorter bumps are ignored."
              >
                {/* A flat drive has nothing to draw: the one line above says it. */}
                {!isFlat(grade) && <DriveTrace label="Road grade" points={grade} unit="%" signed digits={1} split={{ ...GRADE_SIDES, area: true }} {...axis} />}
              </ChartCard>
            )}
          </div>
        )}
        {(topKmh === null || outsideC === null || accel.length < 2) && (
          <p className="text-sm text-faint">Speed, acceleration and outside temperature show once your car sends them.</p>
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

// The owner's names for places, in the same private cache as the page's data, and whether an unnamed area
// may be looked up and named (never for a guest, who sees only the names already kept).
async function loadTags(): Promise<{ tags: UserPlace[]; lookUp: boolean }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  return { tags: await loadUserPlaces(owner), lookUp: !owner.viewOnly };
}

// Names for the start and end, best source first (see spotName): the owner's tag, a charging station, then
// the area name Uplink keeps (looked up once each, see lib/server/place-names). One lookup per render (React
// cache, keyed by the page's own pins), shared by the card's names and its naming buttons. Never a Google name.
const loadEnds = cache(async (pins: MapPin[]): Promise<{ from: SpotName | null; to: SpotName | null; lookUp: boolean }> => {
  const ends = [pins.find((p) => p.kind === "start"), pins.findLast((p) => p.kind === "end")];
  const { tags, lookUp } = await loadTags();
  const names = await (lookUp ? placeNames : cachedPlaceNames)(ends.filter((p): p is MapPin => p !== undefined)).catch(() => new Map<string, string>());
  const name = (p: MapPin | undefined) => (p ? spotName(tags, p, { station: stationAt(p.lat, p.lng), place: names.get(placeKey(p)) }) : null);
  return { from: name(ends[0]), to: name(ends[1]), lookUp };
});

// The card's parts that don't wait on the place names.
type RouteCardBase = Omit<Parameters<typeof RouteCard>[0], "places">;

// Where the trip went, by the names a row shows: a picked Google place by its Google name, with "Google Maps"
// beside it (Google's terms allow its names apart from a map; this card is above the page, not on the map's
// card). "Place not known" when either end has no name, as in the trips list; the same name on both rows when the
// trip began and ended at the same place. The ends come from the map's (loadEnds), then each Google pick's
// live name, in order (never a guest's, see withGoogleNames). Outside any shared cache: the lookup is no-store.
// Beside each end, "Name this place" for an end with no good name, or the pencil to rename the owner's own
// name, never for a guest.
async function NamedRoute({ pins, card }: { pins: MapPin[]; card: RouteCardBase }) {
  const [{ from, to, lookUp }, { owner }] = await Promise.all([loadEnds(pins), requireReader()]);
  const action = (end: SpotName | null) => {
    const kind = end && lookUp ? nameAction(end) : null;
    return end && kind ? <NamePlace target={end.target} compact={kind === "rename"} /> : undefined;
  };
  const actions = { from: action(from), to: action(to) };
  const [named0, named1] = from && to ? await withGoogleNames(owner, [from, to]).catch(() => [from, to]) : [from, to];
  // Each end's whole name, with its city ("Koramangala, Bengaluru"), cut by the card only when too long.
  const [shown0, shown1] = [shownName(named0), shownName(named1)];
  const places: RouteCardPlaces = shown0 && shown1 ? { from: shown0, to: shown1 } : "unknown";
  return <RouteCard {...card} places={places} actions={actions} />;
}

// Each leg of a trip as a row: when, how far, the energy and battery when known. Each opens its own page.
function Legs({ legs }: { legs: DriveDetail["trip"]["legs"] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Legs</h2>
      <TableBox>
        <table className="w-full min-w-md text-sm tabular-nums">
          <thead>
            <tr className={`border-b text-left text-xs text-faint ${TABLE_HEAD_ROW}`}>
              <th scope="col" className="w-10 pr-3 font-normal">#</th>
              <th scope="col" className="pr-4 font-normal">Leg</th>
              <th scope="col" className="pr-4 text-right font-normal">Distance</th>
              <th scope="col" className="pr-4 text-right font-normal">Energy</th>
              <th scope="col" className="pr-3 text-right font-normal">Battery</th>
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {legs.map((d, k) => (
              <tr key={d.start} className="group/row relative cursor-pointer *:transition-colors *:duration-150 hover:*:bg-muted focus-within:*:bg-muted">
                <td className="py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
                <th scope="row" className="py-3 pr-4 text-left font-normal whitespace-nowrap">
                  <Link href={`/stats/driving/${d.start}?leg`} className={ROW_LINK}>
                    {formatClock(d.start)} to {formatClock(d.end)}
                  </Link>
                </th>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap"><Measure text={formatKm(d.km)} /></td>
                <td className="py-3 pr-4 text-right font-mono whitespace-nowrap">{d.kwh !== null ? <Measure text={formatKwh(d.kwh)} /> : <span className="text-faint">—</span>}</td>
                <td className="py-3 pr-3 text-right whitespace-nowrap text-muted-foreground">
                  {d.startLevel !== null && d.endLevel !== null ? formatLevels(d.startLevel, d.endLevel) : <span className="text-faint">—</span>}
                </td>
                <td className="py-3 text-right">
                  <RowChevron className="inline-block" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
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
    power: [...figure("Most power", peak(power, 1), 1, formatKw), ...figure("Most won back", peak(power, -1), -1, formatKw)],
    accel: [
      ...figure("Hardest acceleration", peak(accel, 1), 1, (v) => `${formatNumber(v, 1)} km/h`, "Gained in one second, at"),
      ...figure("Hardest braking", peak(accel, -1), -1, (v) => `${formatNumber(v, 1)} km/h`, "Lost in one second, at"),
    ],
  };
}

async function DriveLoader({ params, searchParams }: Pick<PageProps<"/stats/driving/[start]">, "params" | "searchParams">) {
  const [{ start }, query] = await Promise.all([params, searchParams]);
  if (!isDriveStart(start)) notFound();
  const { detail, now, locations } = await loadDetail(Number(start), query.leg !== undefined);
  if (!detail) notFound();
  // Server-side only, for the wording below: never handed to the page.
  const { owner } = await requireReader();
  // The words: the AI's when stored for these exact facts, else the code sentences. Read on every view,
  // outside the cache above, so wording written after the last view shows now. With none stored, it is
  // written after this response (never making the page wait) and shows on the next view.
  const view = describeDrive(detail);
  const key = { vehicleId: detail.vehicleId, start: detail.trip.start, scope: detail.trip.legs.length > 1 ? "trip" : "drive" } as const;
  const stored = await loadDriveWording(owner, key, view.facts);
  // A viewer never sets the AI writing: the owner's own view does.
  if (stored.generate && !owner.viewOnly) after(() => generateDriveWording(owner, key, view.facts));
  const { trip } = detail;
  const tipsBox = await loadTipsBox({
    surface: trip.legs.length > 1 ? TRIP_TIPS : DRIVE_TIPS,
    vehicleId: detail.vehicleId,
    at: trip.start,
    daily: false,
    entity: String(trip.start),
    findings: driveFindings({
      km: trip.km,
      kwh: trip.kwh,
      usual: detail.usual,
      moments: view.moments,
      power: detail.power,
      speed: detail.speed,
      grade: detail.grade,
      legs: trip.legs,
      usableKwh: detail.usableKwh,
      climate: detail.climate ? summariseClimate(detail.climate) : null,
    }),
  });
  return <Drive detail={detail} view={view} words={pickWords(view.code, stored.words)} tipsBox={tipsBox} now={now} locations={locations} />;
}

export default function Page({ params, searchParams }: PageProps<"/stats/driving/[start]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="driving" />
      <BackLink list="/stats/driving" label="Back to Trips" />
      <Suspense fallback={<DriveSkeleton />}>
        <DriveLoader params={params} searchParams={searchParams} />
      </Suspense>
      <PhoneNav current="driving" />
    </div>
  );
}

// "How this drive went" as two tiles: Wh/km against the usual, and the hard moments (with the usual when
// there is one). Each only when the drive has it.
function howItWent({ efficiency, hard }: DriveView["facts"]): Figure[] {
  const tiles: Figure[] = [];
  if (efficiency) {
    const vs = efficiency.vsUsual;
    tiles.push({
      label: "Energy use",
      value: efficiency.whPerKm,
      note:
        vs === null || efficiency.usual === null ? (
          `Your usual shows after ${MIN_USUAL_DRIVES} drives`
        ) : vs.way === "close" ? (
          `Close to your usual ${efficiency.usual}`
        ) : (
          <>
            <span className={vs.way === "better" ? "text-chart-better" : "text-chart-worse"}>
              {vs.by} {vs.way === "better" ? "less" : "more"}
            </span>{" "}
            than your usual {efficiency.usual}
          </>
        ),
    });
  }
  if (hard) {
    const n = hard.brakes + hard.starts;
    const parts = [hard.brakes > 0 && `${hard.brakes} ${hard.brakes === 1 ? "brake" : "brakes"}`, hard.starts > 0 && `${hard.starts} ${hard.starts === 1 ? "start" : "starts"}`].filter(Boolean).join(", ");
    tiles.push({
      label: "Hard moments",
      value: String(n),
      note: [n === 0 ? "No hard starts or stops" : parts, hard.usual !== null && `your usual ${hard.usual}`].filter(Boolean).join(" · "),
    });
  }
  return tiles;
}

