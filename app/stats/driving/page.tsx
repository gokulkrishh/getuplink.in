import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eachFrame } from "@/components/home/frames";
import { DriveList } from "@/components/stats/drive-list";
import { SeasonEfficiency } from "@/components/stats/season-efficiency";
import { DailyDriving, Distance, DriveStatsSection, EnergyUse } from "@/components/stats/driving-sections";
import { customScope } from "@/components/stats/periods";
import { driveStats, withDriveEfficiency } from "@/lib/drive-stats";
import { type Day, dayStrips, stripsBetween } from "@/lib/day-timeline";
import { DayTimeline } from "@/components/stats/day-timeline";
import { EfficiencyBands, Places, SpeedBands } from "@/components/stats/driving-extras";
import { type DrivingExtras, INSIGHT_DAYS, loadDrivingExtras } from "@/lib/server/driving-extra";
import { AWAKE_DAYS, loadPresence } from "@/lib/server/awake";
import { loadStreamSessions } from "@/lib/server/stream-charging";
import { DRIVE_DAYS } from "@/lib/drives";
import { type CustomFrame, periodFrames } from "@/lib/frames";
import { clipSpan, customQuery, type CustomQuery, customRange, daysLabel, inSpan, reachesBefore, rangeTimeframe, recentSpan, type Span } from "@/lib/periods";
import { byRange, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import type { DrivingFigures } from "@/lib/driving-figures";
import { loadDrivingFigures, loadSeasonEfficiency, loadWindowStats, type WindowStats } from "@/lib/server/driving";
import type { SeasonEfficiency as Seasons } from "@/lib/seasons";
import { loadRangeDriving } from "@/lib/server/home";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

export const metadata: Metadata = { title: "Driving · Uplink" };

const DAY = 86_400_000;

// A range picked by date: its driving figures, the insights over its newest days (`insights`: cut to the
// drives kept, and to as many days as the presets read, so the read stays whole), and its days as strips
// (cut to the days the car's presence is kept).
type CustomDriving = CustomFrame & { extras: DrivingExtras; insights: Span; days: Day[] };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// The car is read once; the period counters and the 90-day window share its VIN. A range picked by date
// is an argument, so each one gets its own entry.
async function loadDriving(query: CustomQuery | null): Promise<{
  figures: DrivingFigures;
  window: WindowStats;
  days: Day[];
  extras: DrivingExtras;
  custom: CustomDriving | null;
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
  const insights = frame && recentSpan(frame.span, now - DRIVE_DAYS * DAY, INSIGHT_DAYS, now);
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
  const days = dayStrips(7, layers, figures.since, now);
  const [extras, rangeExtras, seasons] = await Promise.all([
    loadDrivingExtras(owner, vin, window.driving.drives, now),
    insights ? loadDrivingExtras(owner, vin, window.driving.drives, now, insights) : null,
    loadSeasonEfficiency(owner, vin, window.driving.drives, now),
  ]);
  const custom =
    range && frame && insights && rangeExtras
      ? {
          range,
          frame,
          driving: rangeDriving,
          extras: rangeExtras,
          insights,
          days: stripsBetween(Math.max(range.from, istDay(now) - AWAKE_DAYS + 1), range.to, layers, figures.since, now),
        }
      : null;
  return { figures, window, days, extras, custom, seasons, now };
}

async function Driving({ searchParams }: Pick<PageProps<"/stats/driving">, "searchParams">) {
  const { figures, window, days: dayStripsData, extras, custom, seasons, now } = await loadDriving(customQuery(await searchParams));
  const { days, driving } = window;
  // Mirrors the sections' own "enough data" rules, so an empty page says so instead of showing nothing.
  const hasDriving = (figures.periods.all.current.km ?? 0) > 0 || days.filter((d) => d.km !== null).length >= 2 || driving.drives.length > 0;
  const frames = periodFrames(figures, custom, driving.drives, now);
  const range = frames.find((f) => f.key === "custom");
  // What the drives, the days and the strips keep, for a range that starts earlier (see reachesBefore).
  const tripsFrom = now - DRIVE_DAYS * DAY;
  const partial = (windowFrom: number) => range !== undefined && reachesBefore(range.frame.span, windowFrom, figures.since);
  const inRange = range ? driving.drives.filter((d) => inSpan(d.start, range.frame.span)) : [];
  // The insights read the range's newest days only; when that leaves some out, the note names the days read.
  const read = custom?.insights;
  const insightsNote =
    read && read.from < read.to && partial(read.from) ? `Covers only ${daysLabel(istDay(read.from), istDay(read.to - 1), now)}.` : undefined;

  return (
    <StatsFrame view="driving" custom={customScope(custom?.range ?? null, now)} periodSwitch={hasDriving}>
      {hasDriving ? (
        <div className="space-y-12">
          {eachFrame(frames, (f) => <Distance {...f} />, { steady: true })}
          {byRange(range, <DailyDriving days={days} />, ({ frame }) => (
            <DailyDriving days={days} frame={frame} partial={days.length > 0 && partial(days[0].start)} />
          ))}
          {eachFrame(frames, (f) => <EnergyUse {...f} />, { steady: true })}
          <SeasonEfficiency {...seasons} />
          {byRange(range, <DayTimeline days={dayStripsData} now={now} />, ({ frame }) => (
            <DayTimeline
              days={custom?.days ?? []}
              now={now}
              caption={`${frame.title}.${partial(istDayStart(istDay(now) - AWAKE_DAYS + 1)) ? ` Days cover only the last ${AWAKE_DAYS} days.` : ""}`}
            />
          ))}
          {byRange(range, <SpeedBands bins={extras.speed} />, ({ frame }) => (
            <SpeedBands bins={custom?.extras.speed ?? []} words={frame.words} note={insightsNote} />
          ))}
          {byRange(range, <EfficiencyBands byTemp={extras.byTemp} bySpeed={extras.bySpeed} />, ({ frame }) => (
            <EfficiencyBands byTemp={custom?.extras.byTemp ?? []} bySpeed={custom?.extras.bySpeed ?? []} words={frame.words} note={insightsNote} />
          ))}
          {byRange(range, <Places places={extras.places} visited={extras.visited} />, ({ frame }) => (
            <Places places={custom?.extras.places ?? []} visited={custom?.extras.visited ?? []} words={frame.words} note={insightsNote} />
          ))}
          {byRange(range, <DriveStatsSection stats={driveStats(driving.drives, tripsFrom, figures.since, now)} />, ({ frame }) => {
            const kept = clipSpan(frame.span, tripsFrom, now);
            return <DriveStatsSection stats={driveStats(inRange, kept.from, figures.since, kept.to)} title={frame.title} partial={partial(tripsFrom)} />;
          })}
          {byRange(range, <DriveList drives={driving.drives} now={now} />, ({ frame }) => (
            <div className="space-y-3">
              {inRange.length > 0 ? <DriveList drives={inRange} all={driving.drives} now={now} /> : <p className="text-sm text-muted-foreground">No trips {frame.words}.</p>}
              {partial(tripsFrom) && <p className="text-xs text-faint">Trips cover only the last {DRIVE_DAYS} days.</p>}
            </div>
          ))}
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
