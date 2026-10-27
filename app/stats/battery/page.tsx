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
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { type BatteryExtras, loadBatteryExtras } from "@/lib/server/battery-extra";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { loadParkedPlaces } from "@/lib/server/parked-places";
import type { SpotName } from "@/lib/charge-names";

export const metadata: Metadata = { title: "Battery" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Every section comes from the one read of the streamed readings, each kept for its own window (see
// loadWindowStats, loadBatteryExtras); every period, and a range picked by date, is drawn from it. A range
// is an argument, so each one gets its own entry.
async function loadBattery(query: CustomQuery | null): Promise<{
  window: WindowStats;
  sessions: StreamChargeSession[];
  extras: BatteryExtras;
  places: Record<number, SpotName>;
  custom: { range: DayRange; frame: Timeframe } | null;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  const [window, sessions] = await Promise.all([loadWindowStats(owner, vin, now), loadStreamSessions(owner)]);
  const [extras, places] = await Promise.all([
    loadBatteryExtras(owner, vin, window.trend, now),
    // Where each stretch was parked; never fails the page.
    loadParkedPlaces(owner, vin, [...window.driving.parked.map((p) => p.start), ...(window.driving.parkedNow ? [window.driving.parkedNow.start] : [])]).catch(() => ({})),
  ]);
  return { window, sessions, extras, places, custom: range && { range, frame: rangeTimeframe(range, now) }, now };
}

async function Battery({ searchParams }: Pick<PageProps<"/stats/battery">, "searchParams">) {
  const { window, sessions, extras, places, custom, now } = await loadBattery(customQuery(await searchParams));
  const { trend, range, level, driving } = window;
  const enough = trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 || driving.parked.length > 0 || driving.parkedNow !== null;
  const frames = timeframes(custom?.frame ?? null, now);

  return (
    // One switch drives every section. Each period draws only what it has (a quiet one is a line, not a
    // box held to a chart's height), so the page may move on a switch.
    <StatsFrame custom={customScope(custom?.range ?? null, now)} periodSwitch={enough}>
      {enough ? (
        <div className="space-y-12">
          {eachFrame(frames, ({ frame }) => (
            <BatteryHealth trend={trend} range={range} sessions={sessions} frame={frame} teslaPack={extras.teslaPack} drives={driving.drives} now={now} />
          ))}
          {/* The id sits outside the periods' copies, so it is on the page once. */}
          <div id="battery">{eachFrame(frames, ({ frame }) => <BatteryPack trend={trend} frame={frame} />)}</div>
          {eachFrame(frames, ({ frame }) => <TeslaPackByWeek pack={extras.teslaPack} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <CapacityByKm points={extras.capacityByKm} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <CellBalance spread={extras.cellSpreadMv} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <Temperatures temps={extras.temps} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} heading />)}
          {eachFrame(frames, ({ frame }) => <ParkedDrain parked={driving.parked} parkedNow={driving.parkedNow} frame={frame} places={places} />)}
        </div>
      ) : (
        <NotYet title="Not enough data yet">The battery trend shows up after two weeks.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/battery">) {
  return (
    <StatsPage view="battery" description="How the battery is holding up, and what it loses while parked.">
      <Suspense fallback={<StatsSkeleton />}>
        <Battery searchParams={searchParams} />
      </Suspense>
    </StatsPage>
  );
}
