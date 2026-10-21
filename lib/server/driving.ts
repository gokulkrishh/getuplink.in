import "server-only";
import { monthIndex, monthKey } from "@/components/stats/periods";
import { MILES_TO_KM } from "@/lib/car";
import { db } from "./supabase";

export type MonthlyDistance = { month: string; km: number };

const MONTHS = 12;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// First instant of a month in IST, as an ISO string for the query.
function monthStart(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - IST_OFFSET_MS).toISOString();
}

// Latest (or earliest) online odometer reading, optionally before an instant. Raw payload is in miles.
async function reading(before: string | null, ascending: boolean): Promise<number | null> {
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
