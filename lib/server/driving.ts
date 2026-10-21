import "server-only";
import { monthIndex, monthKey } from "@/components/stats/periods";
import { MILES_TO_KM } from "@/lib/car";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";

export type MonthlyDistance = { month: string; km: number };

const MONTHS = 12;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// First instant of a month in IST, as an ISO string for the query.
function monthStart(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - IST_OFFSET_MS).toISOString();
}

// The demo odometer drops 38 km per day into the past, so months are about 38 km x days, with some wobble.
function demoDistance(): MonthlyDistance[] {
  const now = Date.now();
  const current = monthIndex(now);
  const wobble = [1.0, 0.96, 1.08, 0.92, 1.04, 1.1, 0.98, 0.94, 1.06, 1.0, 0.9, 1.05];
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "numeric" }).format(now));
  return Array.from({ length: MONTHS }, (_, k) => {
    const index = current - (MONTHS - 1 - k);
    const days = k === MONTHS - 1 ? dayOfMonth : new Date(Date.UTC(Math.floor(index / 12), (index % 12) + 1, 0)).getUTCDate();
    return { month: monthKey(index), km: Math.round(days * 38 * wobble[k]) };
  });
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
  if (DEMO) return demoDistance();
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
