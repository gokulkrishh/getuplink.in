import "server-only";
import { type ChargeLevel, type WeeklyRange } from "@/lib/charge-level";
import { withArchivedDrives } from "@/lib/drive-archive";
import { analyseDriving, DRIVE_DAYS, type Driving } from "@/lib/drives";
import { type DayKm, dailyDistance, dayBounds, istDay, istDayStart, num, type WeeklyPack } from "@/lib/telemetry-derive";
import { DEMO } from "@/lib/demo";
import { type DrivingCounters, type DrivingFigures, drivingFigures, type DrivingPeriod, drivingTimeframe, figureInstants, timeframeInstants } from "@/lib/driving-figures";
import { PRESENCE_FIELDS } from "@/lib/awake";
import { isHourSlot, type Timeframe } from "@/lib/periods";
import { seasonEfficiency, type SeasonEfficiency, seasonTimeframe } from "@/lib/seasons";
import type { Drive } from "@/lib/drives";
import { batteryTrend, trendWindow } from "./battery";
import { chargeLevel, fullRange } from "./charge-level";
import { demoCounter, demoCounters } from "./demo";
import { loadArchivedDrives } from "./drive-archive";
import { type Owner, ownerDb } from "./data/owner";
import { type CounterColumn, LATEST, loadCounters, toColumn } from "./energy";
import { loadReadingsByField } from "./telemetry-window";

// The online polls' odometer (miles) at each boundary, in one request. The poll ran before the stream
// began, so earlier months only have these. In demo mode the counters cover it. Null when the query fails.
async function loadPolledOdometers(owner: Owner, bounds: string[]): Promise<CounterColumn | null> {
  if (DEMO) return null;
  const { data, error } = await ownerDb(owner).rpc("snapshot_odometer_at", { p_at: bounds });
  if (error) {
    console.warn("Odometer history unavailable:", error.message);
    return null;
  }
  const rows = data as { at: string | null; odometer: string | null; polled_at: string | null }[];
  return toColumn(
    bounds,
    rows.map((row) => {
      const miles = row.odometer == null ? NaN : Number(row.odometer);
      return { at: row.at, value: Number.isFinite(miles) ? miles : null, readAt: row.polled_at };
    }),
  );
}

const FIGURE_FIELDS = ["Odometer", "LifetimeEnergyUsed", "LifetimeEnergyGainedRegen"];

// Distance, energy use and regen for every period (see drivingFigures), in two requests: the streamed
// counters and the polled odometer, each at every instant the figures need. Day's hourly bars need the
// presence fields too, read in the same request, to tell an hour asleep from one parked. `demoSince` is
// the demo's First week cut (see demoFirstWeekStart); it does nothing outside demo mode.
export async function loadDrivingFigures(owner: Owner, vin: string | null, now: number, demoSince?: number): Promise<DrivingFigures> {
  return drivingFigures(await loadFigureCounters(owner, vin, figureInstants(now), true, demoSince), now);
}

// The same figures for one timeframe, like a range picked by date, read at its own instants.
export async function loadTimeframeDriving(owner: Owner, vin: string | null, frame: Timeframe, now: number, demoSince?: number): Promise<DrivingPeriod> {
  return drivingTimeframe(await loadFigureCounters(owner, vin, timeframeInstants([frame], now), frame.slots.some(isHourSlot), demoSince), frame, now);
}

async function loadFigureCounters(owner: Owner, vin: string | null, instants: number[], hourly = false, demoSince?: number): Promise<DrivingCounters> {
  const bounds = instants.map((t) => (t === Infinity ? LATEST : new Date(t).toISOString()));
  const fields = hourly ? [...FIGURE_FIELDS, ...PRESENCE_FIELDS.filter((f) => !FIGURE_FIELDS.includes(f))] : FIGURE_FIELDS;
  const [counters, polledOdometer] = await Promise.all([
    !vin ? null : DEMO && demoSince !== undefined ? demoCounters(fields, instants, demoSince) : loadCounters(owner, vin, fields, bounds),
    loadPolledOdometers(owner, bounds),
  ]);
  const column = (field: string) => counters?.get(field) ?? null;
  // The odometer is sent on every wake too, so it counts as a sign of the car being awake.
  const presence = hourly && counters ? ["Odometer", ...PRESENCE_FIELDS].map(column).filter((c): c is CounterColumn => c !== null) : null;
  return { instants, odometer: column("Odometer"), used: column("LifetimeEnergyUsed"), regen: column("LifetimeEnergyGainedRegen"), polledOdometer, presence };
}

export const DRIVING_DAYS = 90;

// Everything the 90-day sections read, in one query (see loadReadingsByField).
const WINDOW_FIELDS = ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"];

export type WindowStats = { days: DayKm[]; driving: Driving; trend: WeeklyPack[]; level: ChargeLevel | null; range: WeeklyRange[] };

// Kilometres per IST day for the last 90 days (see dailyDistance), drives and parked drain for the last
// 90 days (see lib/drives.ts) and the 12-week battery trend, from one read of the streamed readings that
// covers all three windows. Each part keeps to its own window. Empty when the stream can't be read.
// Drives from before the window come from the archive (lib/server/drive-archive.ts), whose readings are
// gone, so the trip list goes back to the first drive archived.
// In demo mode the readings come from the generator, through the same functions.
export async function loadWindowStats(owner: Owner, vin: string | null, now: number): Promise<WindowStats> {
  const empty: WindowStats = { days: [], driving: { drives: [], drain: null, parked: [], parkedNow: null }, trend: [], level: null, range: [] };
  if (!vin) return empty;
  const dailyFrom = new Date(istDayStart(istDay(now) - DRIVING_DAYS + 1)).toISOString();
  const driveFrom = now - DRIVE_DAYS * 86_400_000;
  const from = new Date(Math.min(Date.parse(dailyFrom), driveFrom, trendWindow(now).from)).toISOString();
  const bounds = dayBounds(now, DRIVING_DAYS);
  const [readings, before, polled, archived] = await Promise.all([
    loadReadingsByField(owner, vin, WINDOW_FIELDS, from, new Date(now).toISOString()),
    // The last odometer reading before the daily window, so the first day has something to count from.
    DEMO
      ? { data: { value: demoCounter("Odometer", dailyFrom), created_at: dailyFrom }, error: null }
      : ownerDb(owner).readings("value, created_at").eq("vin", vin).eq("field", "Odometer").lt("created_at", dailyFrom).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // The polls' odometer at each midnight, merged with the stream's as the Distance bars merge them.
    loadPolledOdometers(owner, bounds.map((t) => new Date(t).toISOString())),
    loadArchivedDrives(owner, vin, driveFrom),
  ]);
  if (!readings) return empty;
  const since = (field: string, ms: number) => readings[field].filter((r) => Date.parse(r.at) >= ms);
  const [gear, odometer, battery, energy, lifetime, range, charge] = WINDOW_FIELDS.map((field) => since(field, driveFrom));
  const beforeMiles = num(before.data?.value);
  const start = beforeMiles === null ? null : { at: Date.parse(before.data!.created_at), value: beforeMiles };
  return {
    days: before.error ? [] : dailyDistance(since("Odometer", Date.parse(dailyFrom)), start, now, DRIVING_DAYS, polled?.bounds ?? null),
    driving: withArchive(analyseDriving({ gear, odometer, battery, energy, lifetime, range, charge }, now), archived, driveFrom),
    trend: batteryTrend(readings.EnergyRemaining, readings.BatteryLevel, now),
    level: chargeLevel(readings.BatteryLevel, readings.DetailedChargeState, now),
    range: fullRange(readings.RatedRange, readings.BatteryLevel, now),
  };
}

function withArchive(driving: Driving, archived: Drive[], driveFrom: number): Driving {
  return archived.length ? { ...driving, drives: withArchivedDrives(driving.drives, archived, driveFrom) } : driving;
}

// Wh/km in each of the last four Indian seasons (see seasonEfficiency), in one request: the counters at
// every month's edges. `drives` are all the drives the window read, so the months they cover agree with
// the monthly bars.
export async function loadSeasonEfficiency(owner: Owner, vin: string | null, drives: Drive[], now: number): Promise<SeasonEfficiency> {
  if (!vin) return { seasons: [], drivesFrom: null };
  const frame = seasonTimeframe(now);
  return seasonEfficiency(await loadFigureCounters(owner, vin, timeframeInstants([frame], now)), frame, drives, now);
}
