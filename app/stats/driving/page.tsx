import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DriveList } from "@/components/stats/drive-list";
import { DailyDriving, Distance, EnergyUse } from "@/components/stats/driving-sections";
import { parsePeriod } from "@/components/stats/periods";
import { eachPeriod, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadMonthlyDistance, loadWindowStats, type MonthlyDistance, type WindowStats } from "@/lib/server/driving";
import { loadMonthlyEnergy, type MonthlyEnergy } from "@/lib/server/energy";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Driving · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// The car is read once; the monthly counters and the 90-day window share its VIN.
async function loadDriving(): Promise<{ distance: MonthlyDistance[]; energy: MonthlyEnergy[]; window: WindowStats; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const [distance, energy, window] = await Promise.all([loadMonthlyDistance(vin), loadMonthlyEnergy(vin), loadWindowStats(vin, now)]);
  return { distance, energy, window, now };
}

async function Driving({ searchParams }: Pick<PageProps<"/stats/driving">, "searchParams">) {
  // Read outside the cache: the period only picks what's shown first, and switches in the browser.
  const period = parsePeriod((await searchParams).period);
  const { distance, energy, window, now } = await loadDriving();
  const { days, driving } = window;
  // Mirrors each section's own "enough data" rule, so an empty page says so instead of showing nothing.
  const hasDriving = distance.some((d) => d.km > 0) || days.filter((d) => d.km !== null).length >= 2 || energy.length > 0 || driving.drives.length > 0;

  return (
    <StatsFrame view="driving" period={period} periodSwitch={hasDriving}>
      {hasDriving ? (
        <div className="space-y-12">
          {eachPeriod((p) => <Distance distance={distance} now={now} period={p} />)}
          <DailyDriving days={days} />
          {eachPeriod((p) => <EnergyUse energy={energy} now={now} period={p} />)}
          <DriveList drives={driving.drives} now={now} />
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
