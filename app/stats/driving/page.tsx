import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eachFrame } from "@/components/home/frames";
import { DriveList } from "@/components/stats/drive-list";
import { SeasonEfficiency } from "@/components/stats/season-efficiency";
import { Distance, DriveStatsSection, EnergyUse } from "@/components/stats/driving-sections";
import { customScope, type HomePeriod, PERIODS } from "@/components/stats/periods";
import { driveStats, withDriveEfficiency } from "@/lib/drive-stats";
import { type Day, stripsBetween } from "@/lib/day-timeline";
import { DayTimeline } from "@/components/stats/day-timeline";
import { EfficiencyBands, Places, SpeedBands } from "@/components/stats/driving-extras";
import { type DrivingExtras, INSIGHT_DAYS, loadDrivingExtrasFor } from "@/lib/server/driving-extra";
import { withGoogleNames } from "@/lib/server/google-place-names";
import { AWAKE_DAYS, loadPresence } from "@/lib/server/awake";
import { loadStreamSessions } from "@/lib/server/stream-charging";
import { DRIVE_DAYS } from "@/lib/drives";
import { type CustomFrame, fromSince, periodFrames } from "@/lib/frames";
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
  recentSpan,
  type Span,
  type Timeframe,
} from "@/lib/periods";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import type { DrivingFigures } from "@/lib/driving-figures";
import { loadDrivingFigures, loadSeasonEfficiency, loadWindowStats, type WindowStats } from "@/lib/server/driving";
import type { SeasonEfficiency as Seasons } from "@/lib/seasons";
import { loadRangeDriving } from "@/lib/server/home";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

export const metadata: Metadata = { title: "Driving" };

const DAY = 86_400_000;

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
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
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
  const insights = frames.map((f) => recentSpan(f.frame.span, now - DRIVE_DAYS * DAY, INSIGHT_DAYS, now));
  const presets = frames.length - (frame ? 1 : 0);
  // The Places table's rows (the 15 shown) with a Google-tagged place's live name; the map keeps `name`.
  const googled = (list: DrivingExtras[]) => Promise.all(list.map(async (x) => ({ ...x, places: await withGoogleNames(x.places.slice(0, 15)) })));
  const [periodExtras, rangeExtras, seasons] = await Promise.all([
    loadDrivingExtrasFor(owner, vin, window.driving.drives, insights.slice(0, presets)).then(googled),
    // A range may lie outside the periods' days, so it is read on its own.
    frame ? loadDrivingExtrasFor(owner, vin, window.driving.drives, insights.slice(presets)).then(googled) : [],
    loadSeasonEfficiency(owner, vin, window.driving.drives, now),
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
  return { figures, window, custom: range && frame ? { range, frame, driving: rangeDriving } : null, byFrame, seasons, now };
}

async function Driving({ searchParams }: Pick<PageProps<"/stats/driving">, "searchParams">) {
  const { figures, window, custom, byFrame, seasons, now } = await loadDriving(customQuery(await searchParams));
  const { days, driving } = window;
  // Mirrors the sections' own "enough data" rules, so an empty page says so instead of showing nothing.
  const hasDriving = (figures.periods.all.current.km ?? 0) > 0 || days.filter((d) => d.km !== null).length >= 2 || driving.drives.length > 0;
  const frames = periodFrames(figures, custom, driving.drives, now);
  // What the drives and the strips keep, for a span that starts earlier (see reachesBefore).
  const tripsFrom = now - DRIVE_DAYS * DAY;
  const stripsFrom = istDayStart(istDay(now) - AWAKE_DAYS + 1);
  const partial = (span: Span, windowFrom: number) => reachesBefore(span, windowFrom, figures.since);
  // The insights read a span's newest days only; when that leaves some out, the note names the days read.
  const insightsNote = (key: HomePeriod, span: Span) => {
    const read = byFrame[key]?.insights;
    return read && read.from < read.to && partial(span, read.from) ? `Covers only ${daysLabel(istDay(read.from), istDay(read.to - 1), now)}.` : undefined;
  };

  return (
    <StatsFrame view="driving" custom={customScope(custom?.range ?? null, now)} periodSwitch={hasDriving}>
      {hasDriving ? (
        <div className="space-y-12">
          {eachFrame(frames, (f) => {
            const { frame, driving: figures_ } = fromSince(f, figures.since, now);
            return <Distance frame={frame} driving={figures_} drives={{ list: driving.drives, from: tripsFrom }} />;
          })}
          {eachFrame(frames, (f) => {
            const { frame, driving: figures_ } = fromSince(f, figures.since, now);
            return <EnergyUse frame={frame} driving={figures_} />;
          })}
          {/* Seasons are compared across the year, so no single period changes them. */}
          <SeasonEfficiency {...seasons} />
          {eachFrame(frames, ({ key, frame }) => (
            <DayTimeline
              days={byFrame[key]?.days ?? []}
              now={now}
              caption={`${frame.title}.${partial(frame.span, stripsFrom) ? ` Days cover only the last ${AWAKE_DAYS} days.` : ""}`}
            />
          ))}
          {eachFrame(frames, ({ key, frame }) => (
            <SpeedBands bins={byFrame[key]?.extras.speed ?? []} words={frame.words} note={insightsNote(key, frame.span)} />
          ))}
          {eachFrame(frames, ({ key, frame }) => (
            <EfficiencyBands byTemp={byFrame[key]?.extras.byTemp ?? []} bySpeed={byFrame[key]?.extras.bySpeed ?? []} words={frame.words} note={insightsNote(key, frame.span)} />
          ))}
          {eachFrame(frames, ({ key, frame }) => (
            <Places places={byFrame[key]?.extras.places ?? []} visited={byFrame[key]?.extras.visited ?? []} words={frame.words} note={insightsNote(key, frame.span)} />
          ))}
          {eachFrame(frames, ({ frame }) => {
            const kept = clipSpan(frame.span, tripsFrom, now);
            const inFrame = driving.drives.filter((d) => inSpan(d.start, frame.span));
            return (
              <DriveStatsSection
                stats={driveStats(inFrame, kept.from, figures.since, kept.to)}
                title={frame.title}
                spanDays={(Math.min(frame.span.to, now) - frame.span.from) / DAY}
                partial={partial(frame.span, tripsFrom)}
              />
            );
          })}
          {eachFrame(frames, ({ frame }) => {
            const inFrame = driving.drives.filter((d) => inSpan(d.start, frame.span));
            return (
              <div className="space-y-3">
                {inFrame.length > 0 ? <DriveList drives={inFrame} all={driving.drives} now={now} /> : <p className="text-sm text-muted-foreground">No trips {frame.words}.</p>}
                {partial(frame.span, tripsFrom) && <p className="text-sm text-faint">Trips cover only the last {DRIVE_DAYS} days.</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <NotYet title="Not enough driving yet">Distance and energy use show up after a couple of days of driving.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/driving">) {
  return (
    <StatsPage description="How far you drove, the energy it took, and every drive.">
      <Suspense fallback={<StatsSkeleton />}>
        <Driving searchParams={searchParams} />
      </Suspense>
    </StatsPage>
  );
}
