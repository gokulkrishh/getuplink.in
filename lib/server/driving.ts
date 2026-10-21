import "server-only";
import { monthIndex, monthKey } from "@/components/stats/periods";
import { MILES_TO_KM } from "@/lib/car";
import { type DayKm, dailyDistance, istDay, istDayStart, num } from "@/lib/telemetry-derive";
import { DEMO } from "@/lib/demo";
import { demoCounter } from "./demo";
import { db } from "./supabase";
import { loadPrimaryVin, loadReadings } from "./telemetry";

export type MonthlyDistance = { month: string; km: number };

const MONTHS = 12;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// First instant of a month in IST, as an ISO string for the query.
function monthStart(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - IST_OFFSET_MS).toISOString();
}

// Latest (or earliest) online odometer reading, optionally before an instant. Raw payload is in miles.
async function reading(before: string | null, ascending: boolean): Promise<number | null> {
  if (DEMO) {
    const miles = demoCounter("Odometer", before, ascending);
    return miles === null ? null : miles * MILES_TO_KM;
  }
  let query = db()
    .from("snapshots")
    .select("polled_at, odometer:raw->vehicle_state->>odometer")
    .eq("state", "online")
    .not("raw->vehicle_state->>odometer", "is", null)
    .order("polled_at", { ascending })
    .limit(1);
  if (before) query = query.lt("polled_at", before);
  const { data, error } = await query;
  if (error) {
    console.warn("Odometer history unavailable:", error.message);
    return null;
  }
  const odometer = (data?.[0] as { odometer: string | null } | undefined)?.odometer;
  const miles = odometer == null ? NaN : Number(odometer);
  return Number.isFinite(miles) ? miles * MILES_TO_KM : null;
}

// Kilometres driven per month for the last 12 months (IST), from the odometer. It asks for one reading
// per month boundary instead of pulling every poll, which would run into PostgREST's row cap.
export async function loadMonthlyDistance(): Promise<MonthlyDistance[]> {
  const firstIndex = monthIndex(Date.now()) - (MONTHS - 1);
  // ends[k] is the last reading before window month k starts (so it closes the month before it);
  // ends[MONTHS] is the latest reading, which closes the current month.
  const [first, ...ends] = await Promise.all([
    reading(null, true),
    ...Array.from({ length: MONTHS + 1 }, (_, k) => reading(k === MONTHS ? null : monthStart(firstIndex + k), false)),
  ]);
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

// Kilometres per IST day for the last 90 days, from the streamed odometer (see dailyDistance). Empty when
// the stream can't be read.
export async function loadDailyDistance(): Promise<DayKm[]> {
  const vin = await loadPrimaryVin();
  if (!vin) return [];
  const now = Date.now();
  const from = new Date(istDayStart(istDay(now) - DRIVING_DAYS + 1)).toISOString();
  const [readings, before] = await Promise.all([
    loadReadings(vin, "Odometer", from),
    // The last reading before the window, so the first day has something to count from.
    DEMO
      ? { data: { value: demoCounter("Odometer", from) }, error: null }
      : db().from("telemetry_readings").select("value").eq("vin", vin).eq("field", "Odometer").lt("created_at", from).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!readings || before.error) return [];
  return dailyDistance(readings, num(before.data?.value), now, DRIVING_DAYS);
}
