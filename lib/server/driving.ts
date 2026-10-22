import "server-only";
import { monthIndex, monthKey } from "@/components/stats/periods";
import { MILES_TO_KM } from "@/lib/car";
import { analyseDriving, DRIVE_DAYS, type Driving } from "@/lib/drives";
import { type DayKm, dailyDistance, istDay, istDayStart, num, type WeeklyPack } from "@/lib/telemetry-derive";
import { DEMO } from "@/lib/demo";
import { batteryTrend, trendWindow } from "./battery";
import { demoCounter } from "./demo";
import { db } from "./supabase";
import { type CounterColumn, type CounterValue, loadCounters, monthBounds, toColumn } from "./energy";
import { loadReadingsByField } from "./telemetry-window";

export type MonthlyDistance = { month: string; km: number };

const MONTHS = 12;

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

type OdometerReading = CounterValue | null | undefined;
const newer = (a: OdometerReading, b: OdometerReading) => (!a ? b : !b ? a : b.at > a.at ? b : a);
const older = (a: OdometerReading, b: OdometerReading) => (!a ? b : !b ? a : b.at < a.at ? b : a);

// Kilometres driven per month for the last 12 months (IST), from the odometer: the streamed one or the
// polled one, whichever was read last before each boundary. One reading per boundary instead of every
// poll, which would run into PostgREST's row cap. `vin` is the car's (see loadPrimaryVehicle); without one
// only the polled odometer counts.
export async function loadMonthlyDistance(vin: string | null): Promise<MonthlyDistance[]> {
  const firstIndex = monthIndex(Date.now()) - (MONTHS - 1);
  const bounds = monthBounds(firstIndex);
  const [streamed, polled] = await Promise.all([
    vin ? loadCounters(vin, ["Odometer"], bounds).then((counters) => counters?.get("Odometer") ?? null) : null,
    loadPolledOdometers(bounds),
  ]);
  const km = (reading: OdometerReading) => (reading ? reading.value * MILES_TO_KM : null);
  // ends[k] is the last reading before window month k starts (so it closes the month before it);
  // ends[MONTHS] is the latest reading, which closes the current month.
  const ends = bounds.map((_, k) => km(newer(streamed?.bounds[k], polled?.bounds[k])));
  const first = km(older(streamed?.first, polled?.first));
  const result: MonthlyDistance[] = [];
  for (let k = 0; k < MONTHS; k++) {
    const end = ends[k + 1];
    // With nothing before the month, count from the first reading ever taken.
    const start = ends[k] ?? first;
    // Before the car's first reading there is nothing to show, so those months are left out.
    if (end == null || start == null) continue;
    result.push({ month: monthKey(firstIndex + k), km: Math.max(0, Math.round(end - start)) });
  }
  return result;
}

export const DRIVING_DAYS = 90;

// Everything the 90-day sections read, in one query (see loadReadingsByField).
const WINDOW_FIELDS = ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"];

export type WindowStats = { days: DayKm[]; driving: Driving; trend: WeeklyPack[] };

// Kilometres per IST day for the last 90 days (see dailyDistance), drives and parked drain for the last
// 90 days (see lib/drives.ts) and the 12-week battery trend, from one read of the streamed readings that
// covers all three windows. Each part keeps to its own window. Empty when the stream can't be read.
// In demo mode the readings come from the generator, through the same functions.
export async function loadWindowStats(vin: string | null, now: number): Promise<WindowStats> {
  const empty: WindowStats = { days: [], driving: { drives: [], drain: null }, trend: [] };
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
  };
}
