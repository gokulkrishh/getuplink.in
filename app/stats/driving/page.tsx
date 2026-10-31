import type { Metadata } from "next";
import { cacheLife, cacheTag, io } from "next/cache";
import { after } from "next/server";
import { Suspense } from "react";
import { eachFrame } from "@/components/home/frames";
import { DriveList } from "@/components/stats/drive-list";
import { SeasonEfficiency } from "@/components/stats/season-efficiency";
import { Distance, DriveStatsSection } from "@/components/stats/driving-sections";
import { customScope, type HomePeriod, PERIODS } from "@/components/stats/periods";
import { driveStops } from "@/lib/bar-stops";
import { driveStats, withDriveEfficiency } from "@/lib/drive-stats";
import { type Day, stripsBetween } from "@/lib/day-timeline";
import { EfficiencyBands, Places, SpeedBands } from "@/components/stats/driving-extras";
import { type DrivingExtras, loadDrivingExtrasFor } from "@/lib/server/driving-extra";
import { insightSpan, withGooglePlaces } from "@/lib/server/driving-places";
import { AWAKE_DAYS, loadPresence } from "@/lib/server/awake";
import { loadStreamSessions } from "@/lib/server/stream-charging";
import { DRIVE_DAYS } from "@/lib/drives";
import { type CustomFrame, type Frame, fromSince, periodFrames } from "@/lib/frames";
import {
  clipSpan,
  customQuery,
  type CustomQuery,
  customRange,
  daysLabel,
  inSpan,
  periodTimeframe,
  reachesBefore,
  rangeTimeframe,
  type Span,
  type Timeframe,
} from "@/lib/periods";
import { DrivingSkeleton } from "@/components/stats/skeletons";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { requireReader } from "@/lib/server/auth";
import { shownTo } from "@/lib/server/data/owner";
import type { Shown } from "@/lib/view-links";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import type { DrivingFigures } from "@/lib/driving-figures";
import { loadDrivingFigures, loadSeasonEfficiency, loadWindowStats, type WindowStats } from "@/lib/server/driving";
import type { SeasonEfficiency as Seasons } from "@/lib/seasons";
import { loadRangeDriving } from "@/lib/server/home";
import { loadTripPlaces } from "@/lib/server/trip-places";
import { placeNames } from "@/lib/server/place-names";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { morePlaces, moreTrips } from "./actions";
import { istDay } from "@/lib/telemetry-derive";

export const metadata: Metadata = { title: "Driving" };

const DAY = 86_400_000;

// A span long enough for a season comparison or a speed profile to say something: Year, All, or a range
// picked by date of LONG_DAYS or more (a period's span runs to Infinity, so only a range is measured). On
// a day, a week or a month those sections stay out of the way.
const LONG_DAYS = 90;
const isLong = ({ key, frame }: Pick<Frame, "key" | "frame">) => key === "year" || key === "all" || (key === "custom" && (frame.span.to - frame.span.from) / DAY >= LONG_DAYS);

// What one choice of the switch draws besides its driving figures: the insights over its newest days
// (`insights`: cut to the drives kept, and to INSIGHT_DAYS, so the read stays whole), and its days as strips
// (cut to the days the car's presence is kept).
type FrameExtras = { extras: DrivingExtras; insights: Span; days: Day[] };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// The car is read once; the period counters and the 90-day window share its VIN. Every period's insights
// come from one read of the last INSIGHT_DAYS; a range picked by date is an argument, so each one gets its
// own entry and its own read.
async function loadDriving(query: CustomQuery | null): Promise<{
  figures: DrivingFigures;
  window: WindowStats;
  custom: CustomFrame | null;
  byFrame: Partial<Record<HomePeriod, FrameExtras>>;
  seasons: Seasons;
  routes: Record<number, string>;
  // Spots the trips and places show with no area name kept yet (see Driving).
  unnamed: { trips: { lat: number; lng: number }[]; places: { lat: number; lng: number }[] };
  shown: Shown;
  guest: boolean;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vehicle = await loadPrimaryVehicle(owner);
  const vin = vehicle?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  const frame = range && rangeTimeframe(range, now);
  const [counted, window, presence, sessions, rangeDriving] = await Promise.all([
    loadDrivingFigures(owner, vin, now),
    loadWindowStats(owner, vin, now),
    loadPresence(owner, vehicle, now),
    loadStreamSessions(owner),
    frame ? loadRangeDriving(owner, "normal", vin, frame, now) : null,
  ]);
  const figures = withDriveEfficiency(counted, window.driving.drives, now);
  const layers = {
    driving: window.driving.drives,
    charging: sessions.map((s) => ({ start: Date.parse(s.started_at), end: s.ended_at ? Date.parse(s.ended_at) : now })),
    asleep: presence.days.flatMap((d) => d.runs.filter((r) => r.state === "asleep")),
  };
  // Each period, then the range picked by date; each reads its newest INSIGHT_DAYS of the drives kept.
  const frames: { key: HomePeriod; frame: Timeframe }[] = [
    ...PERIODS.map(({ value }) => ({ key: value, frame: periodTimeframe(value, now) })),
    ...(frame ? [{ key: "custom" as const, frame }] : []),
  ];
  const insights = frames.map((f) => insightSpan(f.frame, now));
  const presets = frames.length - (frame ? 1 : 0);
  const [periodExtras, rangeExtras, seasons, trips] = await Promise.all([
    loadDrivingExtrasFor(owner, vin, window.driving.drives, insights.slice(0, presets)).then(withGooglePlaces(owner)),
    // A range may lie outside the periods' days, so it is read on its own.
    frame ? loadDrivingExtrasFor(owner, vin, window.driving.drives, insights.slice(presets)).then(withGooglePlaces(owner)) : [],
    loadSeasonEfficiency(owner, vin, window.driving.drives, now),
    loadTripPlaces(owner, vin, window.driving.drives),
  ]);
  const extras = [...periodExtras, ...rangeExtras];
  // The strips: the frame's days, no further back than the car's presence is kept.
  const today = istDay(now);
  const keptFrom = today - AWAKE_DAYS + 1;
  const days = (f: Timeframe) => {
    const first = Number.isFinite(f.span.from) ? istDay(f.span.from) : keptFrom;
    const last = Number.isFinite(f.span.to) ? istDay(f.span.to - 1) : today;
    return stripsBetween(Math.max(first, keptFrom), last, layers, figures.since, now);
  };
  const byFrame = Object.fromEntries(frames.map((f, k) => [f.key, { extras: extras[k], insights: insights[k], days: days(f.frame) }]));
  // A viewer looks nothing up: they see the names already kept.
  const unnamed = owner.viewOnly ? { trips: [], places: [] } : { trips: trips.unnamed, places: extras.flatMap((x) => x.unnamed) };
  return { figures, window, custom: range && frame ? { range, frame, driving: rangeDriving } : null, byFrame, seasons, routes: trips.routes, unnamed, shown: shownTo(owner), guest: owner.viewOnly === true, now };
}

type Spot = { lat: number; lng: number };

// Area names not kept yet, looked up once the response is sent (a couple at a time, see placeNames), never
// while the page waits; they show on a later load. Outside the cache, where after() belongs; it waits for a
// real request, as the background syncs do (components/background-sync.tsx). Render inside <Suspense>.
async function LookUpPlaceNames({ trips, places }: { trips: Spot[]; places: Spot[] }) {
  await io();
  after(() => Promise.all([placeNames(trips), placeNames(places)]));
  return null;
}

async function Driving({ searchParams }: Pick<PageProps<"/stats/driving">, "searchParams">) {
  const query = customQuery(await searchParams);
  const { figures, window, custom, byFrame, seasons, routes, unnamed, shown, guest, now } = await loadDriving(query);
  const lookUp = unnamed.trips.length > 0 || unnamed.places.length > 0;
  const { days, driving } = window;
  // Mirrors the sections' own "enough data" rules, so an empty page says so instead of showing nothing.
  const hasDriving = (figures.periods.all.current.km ?? 0) > 0 || days.filter((d) => d.km !== null).length >= 2 || driving.drives.length > 0;
  const frames = periodFrames(figures, custom, driving.drives, now);
  // What the drives keep, for a span that starts earlier (see reachesBefore).
  const tripsFrom = now - DRIVE_DAYS * DAY;
  const partial = (span: Span, windowFrom: number) => reachesBefore(span, windowFrom, figures.since);
  // The insights read a span's newest days only; when that leaves some out, the note names the days read.
  const coveredDays = (key: HomePeriod, span: Span) => {
    const read = byFrame[key]?.insights;
    return read && read.from < read.to && partial(span, read.from) ? daysLabel(istDay(read.from), istDay(read.to - 1), now) : undefined;
  };
  const insightsNote = (key: HomePeriod, span: Span) => {
    const days = coveredDays(key, span);
    return days ? `Covers only ${days}` : undefined;
  };

  return (
    <StatsFrame custom={customScope(custom?.range ?? null, now)} periodSwitch={hasDriving}>
      {lookUp && (
        <Suspense>
          <LookUpPlaceNames trips={unnamed.trips} places={unnamed.places} />
        </Suspense>
      )}
      {hasDriving ? (
        <div className="space-y-12">
          {/* The period's drive figures lead the page, then the distance, then the deeper charts. */}
          {eachFrame(frames, ({ frame }) => {
            const kept = clipSpan(frame.span, tripsFrom, now);
            const inFrame = driving.drives.filter((d) => inSpan(d.start, frame.span));
            return (
              <DriveStatsSection
                stats={driveStats(inFrame, kept.from, figures.since, kept.to)}
                partial={partial(frame.span, tripsFrom)}
              />
            );
          })}
          {eachFrame(frames, (f) => {
            const { frame, driving: figures_ } = fromSince(f, figures.since, now);
            return <Distance frame={frame} driving={figures_} stops={driveStops(driving.drives, now)} />;
          })}
          {eachFrame(frames, ({ key, frame }) => (
            <EfficiencyBands byTemp={byFrame[key]?.extras.byTemp ?? []} bySpeed={byFrame[key]?.extras.bySpeed ?? []} byAc={byFrame[key]?.extras.byAc ?? []} frame={frame} note={insightsNote(key, frame.span)} covered={coveredDays(key, frame.span)} />
          ))}
          {/* Seasons are compared across the year, so no single period changes them; they show on the long spans only (see isLong). */}
          {eachFrame(frames, (f) => (isLong(f) ? <SeasonEfficiency {...seasons} /> : null))}
          {eachFrame(frames, ({ key, frame }) => {
            const inFrame = driving.drives.filter((d) => inSpan(d.start, frame.span));
            return (
              <div className="space-y-3">
                {inFrame.length > 0 ? <DriveList drives={inFrame} now={now} routes={routes} more={moreTrips.bind(null, { period: key, query })} shown={shown} /> : <p className="text-sm text-muted-foreground">No trips.</p>}
                {partial(frame.span, tripsFrom) && <p className="text-sm text-faint">Trips cover only the last {DRIVE_DAYS} days.</p>}
              </div>
            );
          })}
          {/* Where the car parks and went: none for a view link that hides locations, not an empty table. */}
          {shown.locations && eachFrame(frames, ({ key, frame }) => (
            <Places places={byFrame[key]?.extras.places ?? []} visited={byFrame[key]?.extras.visited ?? []} note={insightsNote(key, frame.span)} more={morePlaces.bind(null, { period: key, query })} canName={!guest} />
          ))}
          {eachFrame(frames, (f) => (isLong(f) ? <SpeedBands bins={byFrame[f.key]?.extras.speed ?? []} note={insightsNote(f.key, f.frame.span)} /> : null))}
        </div>
      ) : (
        <NotYet title="No drives yet">Your drives show up here after your first trip.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/driving">) {
  return (
    <StatsPage view="driving" description="Where your kilometres went, and how efficiently.">
      <Suspense fallback={<StatsSkeleton><DrivingSkeleton /></StatsSkeleton>}>
        <Driving searchParams={searchParams} />
      </Suspense>
    </StatsPage>
  );
}
