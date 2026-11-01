import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { eachFrame } from "@/components/home/frames";
import { CapacityByKm, CellBalance, Temperatures, TeslaPackByWeek } from "@/components/stats/battery-extras";
import { BatteryHealth } from "@/components/stats/battery-health";
import { BatteryPack } from "@/components/stats/battery-pack";
import { ChargeLevelChart } from "@/components/stats/charge-level";
import { ParkedDrain } from "@/components/stats/parked-drain";
import { customScope } from "@/components/stats/periods";
import { BatterySkeleton } from "@/components/stats/skeletons";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { timeframes } from "@/lib/frames";
import { customQuery, type CustomQuery, customRange, type DayRange, rangeTimeframe, type Timeframe } from "@/lib/periods";
import { requireReader } from "@/lib/server/auth";
import { shownTo } from "@/lib/server/data/owner";
import type { Shown } from "@/lib/view-links";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadWindowStats, type WindowStats } from "@/lib/server/driving";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { type BatteryExtras, loadBatteryExtras } from "@/lib/server/battery-extra";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { loadStretchPlaces } from "@/lib/server/parked-places";
import type { SpotName } from "@/lib/charge-names";
import { loadTipsBox } from "@/components/tips-box";
import type { DayStrip } from "@/lib/awake";
import { BATTERY_TIPS, batteryFindings } from "@/lib/battery-tips";
import { averagePrice, type PricedCharge } from "@/lib/charge-tips";
import { DRIVE_DAYS } from "@/lib/drives";
import { MODE_FIELDS, type ModeReadings } from "@/lib/parked-modes";
import { loadPresence } from "@/lib/server/awake";
import { loadReadingsByField } from "@/lib/server/telemetry-window";
import { loadPricedCharges } from "@/lib/server/charge-tips";
import { moreParked } from "./actions";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

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
  presence: DayStrip[];
  priced: PricedCharge[];
  modes: ModeReadings | undefined;
  vehicleId: string | null;
  shown: Shown;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const car = await loadPrimaryVehicle(owner);
  const vin = car?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  // Only the extras and the parked places need the window; the tips' reads start alongside it.
  const [window, sessions, presence, priced, modes] = await Promise.all([
    loadWindowStats(owner, vin, now),
    loadStreamSessions(owner),
    // For the tips: when the car woke while parked, and what the owner pays per kWh.
    car ? loadPresence(owner, car, now).then((p) => p.days).catch(() => []) : [],
    loadPricedCharges(owner, now),
    // Which modes the car reported on while parked, so a tip names one only when it was on.
    vin ? loadReadingsByField(owner, vin, [...MODE_FIELDS], new Date(now - DRIVE_DAYS * 86_400_000).toISOString(), new Date(now).toISOString()).catch(() => null) : null,
  ]);
  const [extras, places] = await Promise.all([
    loadBatteryExtras(owner, vin, window.trend, now),
    // Where each stretch was parked; never fails the page.
    loadStretchPlaces(owner, vin, window.driving),
  ]);
  return { window, sessions, extras, places, custom: range && { range, frame: rangeTimeframe(range, now) }, presence, priced, modes: modes ?? undefined, vehicleId: car?.id ?? null, shown: shownTo(owner), now };
}

async function Battery({ searchParams }: Pick<PageProps<"/stats/battery">, "searchParams">) {
  const query = customQuery(await searchParams);
  const { window, extras, places, custom, presence, priced, modes, vehicleId, shown, now } = await loadBattery(query);
  const { trend, range, level, driving } = window;
  const enough = trend.length >= 2 || range.length > 0 || (level?.points.length ?? 0) >= 2 || driving.parked.length > 0 || driving.parkedNow !== null;
  const frames = timeframes(custom?.frame ?? null, now);
  // The tips (lib/battery-tips.ts), over what the page holds: the period switch doesn't change them.
  const tips = batteryFindings({ parked: driving.parked, presence, level: level?.points ?? [], avgPrice: averagePrice(priced), now, modes });
  const today = istDayStart(istDay(now));
  // Read with the page's data, so the box and the page arrive together; none when there are no tips to show.
  const tipsBox = enough ? await loadTipsBox({ surface: BATTERY_TIPS, vehicleId, at: today, daily: true, entity: String(today), findings: tips }) : null;

  return (
    // One switch drives every section. Each period draws only what it has (a quiet one is a line, not a
    // box held to a chart's height), so the page may move on a switch.
    <StatsFrame view="battery" custom={customScope(custom?.range ?? null, now)} periodSwitch={enough}>
      {enough ? (
        <div className="space-y-12">
          {tipsBox}
          {eachFrame(frames, () => (
            <BatteryHealth trend={trend} range={range} drives={driving.drives} now={now} />
          ))}
          {eachFrame(frames, ({ key, frame }) => <ParkedDrain parked={driving.parked} parkedNow={driving.parkedNow} frame={frame} places={places} more={moreParked.bind(null, { period: key, query })} shown={shown} />)}
          {eachFrame(frames, ({ frame }) => <ChargeLevelChart level={level} now={now} frame={frame} heading />)}
          {/* The id sits outside the periods' copies, so it is on the page once. */}
          <div id="battery">{eachFrame(frames, ({ frame }) => <BatteryPack trend={trend} frame={frame} />)}</div>
          {eachFrame(frames, ({ frame }) => <TeslaPackByWeek pack={extras.teslaPack} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <CapacityByKm points={extras.capacityByKm} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <CellBalance spread={extras.cellSpreadMv} frame={frame} />)}
          {eachFrame(frames, ({ frame }) => <Temperatures temps={extras.temps} frame={frame} />)}
        </div>
      ) : (
        <NotYet title="No battery trend yet">It shows up after about two weeks of data.</NotYet>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/battery">) {
  return (
    <StatsPage view="battery" description="How your battery is ageing, and what it loses while parked.">
      <Suspense fallback={<StatsSkeleton><BatterySkeleton /></StatsSkeleton>}>
        <Battery searchParams={searchParams} />
      </Suspense>
    </StatsPage>
  );
}
