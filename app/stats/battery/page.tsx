import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eachFrame } from "@/components/home/frames";
import { CapacityByKm, CellBalance, Temperatures, TeslaPackByWeek } from "@/components/stats/battery-extras";
import { BatteryHealth } from "@/components/stats/battery-health";
import { BatteryPack } from "@/components/stats/battery-pack";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { ParkedDrain } from "@/components/stats/parked-drain";
import { customScope } from "@/components/stats/periods";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { timeframes } from "@/lib/frames";
import { customQuery, type CustomQuery, customRange, type DayRange, rangeTimeframe, type Timeframe } from "@/lib/periods";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { type BatteryExtras, loadBatteryExtras } from "@/lib/server/battery-extra";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Battery · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Every section comes from the one read of the streamed readings, each kept for its own window (see
// loadWindowStats, loadBatteryExtras); every period, and a range picked by date, is drawn from it. A range
// is an argument, so each one gets its own entry.
async function loadBattery(query: CustomQuery | null): Promise<{
  window: WindowStats;
  sessions: StreamChargeSession[];
  extras: BatteryExtras;
  custom: { range: DayRange; frame: Timeframe } | null;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  const [window, sessions] = await Promise.all([loadWindowStats(vin, now), loadStreamSessions()]);
  const extras = await loadBatteryExtras(vin, window.trend, now);
  return { window, sessions, extras, custom: range && { range, frame: rangeTimeframe(range, now) }, now };
}

async function Battery({ searchParams }: Pick<PageProps<"/stats/battery">, "searchParams">) {
  const { window, sessions, extras, custom, now } = await loadBattery(customQuery(await searchParams));
  const { trend, range, level, driving } = window;
  const enough = trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 || driving.parked.length > 0 || driving.parkedNow !== null;
  const frames = timeframes(custom?.frame ?? null, now);

  return (
    // One switch drives every section. Charts keep the height of their tallest period (steady), so the page
    // below doesn't move on a switch; the parked table grows with its rows.
    <StatsFrame view="battery" custom={customScope(custom?.range ?? null, now)} periodSwitch={enough}>
      {enough ? (
        <div className="space-y-12">
          {eachFrame(frames, ({ frame }) => <BatteryHealth trend={trend} range={range} sessions={sessions} frame={frame} teslaPack={extras.teslaPack} />, { steady: true })}
          {/* The id sits outside the periods' copies, so it is on the page once. */}
          <div id="battery">{eachFrame(frames, ({ frame }) => <BatteryPack trend={trend} frame={frame} />, { steady: true })}</div>
          {eachFrame(frames, ({ frame }) => <TeslaPackByWeek pack={extras.teslaPack} frame={frame} />, { steady: true })}
          {eachFrame(frames, ({ frame }) => <CapacityByKm points={extras.capacityByKm} frame={frame} />, { steady: true })}
          {eachFrame(frames, ({ frame }) => <CellBalance spread={extras.cellSpreadMv} frame={frame} />, { steady: true })}
          {eachFrame(frames, ({ frame }) => <Temperatures temps={extras.temps} frame={frame} />, { steady: true })}
          {/* Not steady: one recharts chart at a time. Its empty state has the chart's box, so nothing moves. */}
          {eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} heading />)}
          {eachFrame(frames, ({ frame }) => <ParkedDrain parked={driving.parked} parkedNow={driving.parkedNow} frame={frame} />)}
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
