import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CapacityByKm, CellBalance, Temperatures } from "@/components/stats/battery-extras";
import { BatteryHealth } from "@/components/stats/battery-health";
import { BatteryPack } from "@/components/stats/battery-pack";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { ParkedDrain } from "@/components/stats/parked-drain";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { type BatteryExtras, loadBatteryExtras, TEMP_DAYS } from "@/lib/server/battery-extra";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Battery · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Every section comes from the one read of the streamed readings.
async function loadBattery(): Promise<{ window: WindowStats; sessions: StreamChargeSession[]; extras: BatteryExtras; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const [window, sessions] = await Promise.all([loadWindowStats(vin, now), loadStreamSessions()]);
  const extras = await loadBatteryExtras(vin, window.trend, now);
  return { window, sessions, extras, now };
}

async function Battery() {
  const { window, sessions, extras, now } = await loadBattery();
  const { trend, range, level, driving } = window;
  const enough = trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 || driving.parked.length > 0 || driving.parkedNow !== null;

  return (
    <StatsFrame view="battery" periodSwitch={false}>
      {enough ? (
        <div className="space-y-12">
          <BatteryHealth trend={trend} range={range} sessions={sessions} />
          <BatteryPack trend={trend} />
          <CapacityByKm points={extras.capacityByKm} />
          <CellBalance spread={extras.cellSpreadMv} days={TEMP_DAYS} />
          <Temperatures temps={extras.temps} />
          <ChargeLevelChart level={level} now={now} />
          <ParkedDrain drain={driving.drain} parked={driving.parked} parkedNow={driving.parkedNow} />
        </div>
      ) : (
        <NotYet title="Not enough readings yet">The battery trend shows up after two weeks of readings.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page() {
  return (
    <StatsPage description="How the pack is holding up, and what it loses while parked.">
      <Suspense fallback={<StatsSkeleton />}>
        <Battery />
      </Suspense>
    </StatsPage>
  );
}
