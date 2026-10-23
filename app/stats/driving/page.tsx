import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DriveList } from "@/components/stats/drive-list";
import { DailyDriving, Distance, DriveStatsSection, EnergyUse } from "@/components/stats/driving-sections";
import { driveStats, withDriveEfficiency } from "@/lib/drive-stats";
import { type Day, dayStrips } from "@/lib/day-timeline";
import { DayTimeline } from "@/components/stats/day-timeline";
import { loadPresence } from "@/lib/server/awake";
import { loadStreamSessions } from "@/lib/server/stream-charging";
import { DRIVE_DAYS } from "@/lib/drives";
import { eachPeriod, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import type { DrivingFigures } from "@/lib/driving-figures";
import { loadDrivingFigures, loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Driving · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// The car is read once; the period counters and the 90-day window share its VIN.
async function loadDriving(): Promise<{ figures: DrivingFigures; window: WindowStats; days: Day[]; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vehicle = await loadPrimaryVehicle();
  const vin = vehicle?.vin ?? null;
  const [counted, window, presence, sessions] = await Promise.all([loadDrivingFigures(vin, now), loadWindowStats(vin, now), loadPresence(vehicle, now), loadStreamSessions()]);
  const figures = withDriveEfficiency(counted, window.driving.drives, now);
  const days = dayStrips(
    7,
    {
      driving: window.driving.drives,
      charging: sessions.map((s) => ({ start: Date.parse(s.started_at), end: s.ended_at ? Date.parse(s.ended_at) : now })),
      asleep: presence.days.flatMap((d) => d.runs.filter((r) => r.state === "asleep")),
    },
    figures.since,
    now,
  );
  return { figures, window, days, now };
}

async function Driving() {
  const { figures, window, days: dayStripsData, now } = await loadDriving();
  const { days, driving } = window;
  // Mirrors the sections' own "enough data" rules, so an empty page says so instead of showing nothing.
  const hasDriving = (figures.periods.all.current.km ?? 0) > 0 || days.filter((d) => d.km !== null).length >= 2 || driving.drives.length > 0;

  return (
    <StatsFrame view="driving" periodSwitch={hasDriving}>
      {hasDriving ? (
        <div className="space-y-12">
          {eachPeriod((p) => <Distance figures={figures} now={now} period={p} />, { steady: true })}
          <DailyDriving days={days} />
          {eachPeriod((p) => <EnergyUse figures={figures} now={now} period={p} />, { steady: true })}
          <DayTimeline days={dayStripsData} now={now} />
          <DriveStatsSection stats={driveStats(driving.drives, now - DRIVE_DAYS * 86_400_000, figures.since, now)} />
          <DriveList drives={driving.drives} now={now} />
        </div>
      ) : (
        <NotYet title="Not enough driving yet">Distance and energy use show up after a couple of days of driving.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page() {
  return (
    <StatsPage description="How far you drove, the energy it took, and every drive.">
      <Suspense fallback={<StatsSkeleton />}>
        <Driving />
      </Suspense>
    </StatsPage>
  );
}
