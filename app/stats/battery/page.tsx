import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BatteryPack } from "@/components/stats/battery-pack";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { ParkedDrain } from "@/components/stats/parked-drain";
import { parsePeriod } from "@/components/stats/periods";
import { ProjectedRange } from "@/components/stats/projected-range";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Battery · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Every section comes from the one read of the streamed readings.
async function loadBattery(): Promise<{ window: WindowStats; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  return { window: await loadWindowStats(vin, now), now };
}

async function Battery({ searchParams }: Pick<PageProps<"/stats/battery">, "searchParams">) {
  // Only carried on to the other topics: each section here covers its own window (12 weeks, 7 or 30 days, 30
  // nights), so a period switch would change nothing.
  const period = parsePeriod((await searchParams).period);
  const { window, now } = await loadBattery();
  const { trend, range, level, driving } = window;
  const enough = trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 || driving.drain !== null;

  return (
    <StatsFrame view="battery" period={period} periodSwitch={false}>
      {enough ? (
        <div className="space-y-12">
          <BatteryPack trend={trend} />
          <ProjectedRange weeks={range} />
          <ChargeLevelChart level={level} now={now} />
          <ParkedDrain drain={driving.drain} />
        </div>
      ) : (
        <NotYet title="Not enough readings yet">The battery trend shows up after two weeks of readings.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/battery">) {
  return (
    <StatsPage description="How the pack is holding up, and what it loses while parked.">
      <Suspense fallback={<StatsSkeleton />}>
        <Battery searchParams={searchParams} />
      </Suspense>
    </StatsPage>
  );
}
