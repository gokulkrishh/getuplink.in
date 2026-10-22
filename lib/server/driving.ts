import "server-only";
import { type ChargeLevel, type WeeklyRange } from "@/lib/charge-level";
import { analyseDriving, DRIVE_DAYS, type Driving } from "@/lib/drives";
import { type DayKm, dailyDistance, istDay, istDayStart, num, type WeeklyPack } from "@/lib/telemetry-derive";
import { DEMO } from "@/lib/demo";
import { type DrivingFigures, drivingFigures, figureInstants } from "@/lib/driving-figures";
import { batteryTrend, trendWindow } from "./battery";
import { chargeLevel, fullRange } from "./charge-level";
import { demoCounter, demoCounters } from "./demo";
import { db } from "./supabase";
import { type CounterColumn, LATEST, loadCounters, toColumn } from "./energy";
import { loadReadingsByField } from "./telemetry-window";

// The online polls' odometer (miles) at each boundary, in one request. The poll ran before the stream
// began, so earlier months only have these. In demo mode the counters cover it. Null when the query fails.
async function loadPolledOdometers(bounds: string[]): Promise<CounterColumn | null> {
  if (DEMO) return null;
  const { data, error } = await db().rpc("snapshot_odometer_at", { p_at: bounds });
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
// counters and the polled odometer, each at every instant the figures need. `demoSince` is the demo's
// First week cut (see demoFirstWeekStart); it does nothing outside demo mode.
export async function loadDrivingFigures(vin: string | null, now: number, demoSince?: number): Promise<DrivingFigures> {
  const instants = figureInstants(now);
  const bounds = instants.map((t) => (t === Infinity ? LATEST : new Date(t).toISOString()));
  const [counters, polledOdometer] = await Promise.all([
    !vin ? null : DEMO && demoSince !== undefined ? demoCounters(FIGURE_FIELDS, instants, demoSince) : loadCounters(vin, FIGURE_FIELDS, bounds),
    loadPolledOdometers(bounds),
  ]);
  const column = (field: string) => counters?.get(field) ?? null;
  return drivingFigures({ instants, odometer: column("Odometer"), used: column("LifetimeEnergyUsed"), regen: column("LifetimeEnergyGainedRegen"), polledOdometer }, now);
}

export const DRIVING_DAYS = 90;

// Everything the 90-day sections read, in one query (see loadReadingsByField).
const WINDOW_FIELDS = ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"];

export type WindowStats = { days: DayKm[]; driving: Driving; trend: WeeklyPack[]; level: ChargeLevel | null; range: WeeklyRange[] };

// Kilometres per IST day for the last 90 days (see dailyDistance), drives and parked drain for the last
// 90 days (see lib/drives.ts) and the 12-week battery trend, from one read of the streamed readings that
// covers all three windows. Each part keeps to its own window. Empty when the stream can't be read.
// In demo mode the readings come from the generator, through the same functions.
export async function loadWindowStats(vin: string | null, now: number): Promise<WindowStats> {
  const empty: WindowStats = { days: [], driving: { drives: [], drain: null }, trend: [], level: null, range: [] };
  if (!vin) return empty;
  const dailyFrom = new Date(istDayStart(istDay(now) - DRIVING_DAYS + 1)).toISOString();
  const driveFrom = now - DRIVE_DAYS * 86_400_000;
  const from = new Date(Math.min(Date.parse(dailyFrom), driveFrom, trendWindow(now).from)).toISOString();
  const [readings, before] = await Promise.all([
    loadReadingsByField(vin, WINDOW_FIELDS, from, new Date(now).toISOString()),
    // The last odometer reading before the daily window, so the first day has something to count from.
    DEMO
      ? { data: { value: demoCounter("Odometer", dailyFrom) }, error: null }
      : db().from("telemetry_readings").select("value").eq("vin", vin).eq("field", "Odometer").lt("created_at", dailyFrom).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!readings) return empty;
  const since = (field: string, ms: number) => readings[field].filter((r) => Date.parse(r.at) >= ms);
  const [gear, odometer, battery, energy, lifetime, range, charge] = WINDOW_FIELDS.map((field) => since(field, driveFrom));
  return {
    days: before.error ? [] : dailyDistance(since("Odometer", Date.parse(dailyFrom)), num(before.data?.value), now, DRIVING_DAYS),
    driving: analyseDriving({ gear, odometer, battery, energy, lifetime, range, charge }, now),
    trend: batteryTrend(readings.EnergyRemaining, readings.BatteryLevel, now),
    level: chargeLevel(readings.BatteryLevel, readings.DetailedChargeState, now),
    range: fullRange(readings.RatedRange, readings.BatteryLevel, now),
  };
}
