import "server-only";
import { monthIndex, monthKey } from "@/components/stats/periods";
import { type EnergyMonth, type Span, energyUseMonth, num } from "@/lib/telemetry-derive";
import { db } from "./supabase";
import { loadPrimaryVin } from "./telemetry";

export type MonthlyEnergy = { month: string; energy: EnergyMonth | null };

const MONTHS = 12;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function monthStart(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - IST_OFFSET_MS).toISOString();
}

// One counter's value: the last reading before an instant (or the latest, with none), or the first
// reading ever. The counters only send a row when they change, so this is how a month gets its start and end.
async function counter(vin: string, field: string, before: string | null, ascending = false): Promise<number | null> {
  let query = db().from("telemetry_readings").select("value").eq("vin", vin).eq("field", field);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query.order("created_at", { ascending }).limit(1).maybeSingle();
  if (error) {
    console.warn(`Telemetry ${field} unavailable:`, error.message);
    return null;
  }
  return num(data?.value);
}

// Energy use per month for the last 12 months (IST), from the streamed lifetime counters and odometer.
// Months stay null until the counters cover them. Empty when there is no car or no reading.
export async function loadMonthlyEnergy(): Promise<MonthlyEnergy[]> {
  const vin = await loadPrimaryVin();
  if (!vin) return [];
  const firstIndex = monthIndex(Date.now()) - (MONTHS - 1);
  const fields = ["LifetimeEnergyUsed", "LifetimeEnergyGainedRegen", "Odometer"];
  // Per field: the first reading ever, then one value per month boundary (the last one is the latest reading).
  const columns = await Promise.all(
    fields.map((field) =>
      Promise.all([
        counter(vin, field, null, true),
        ...Array.from({ length: MONTHS + 1 }, (_, k) => counter(vin, field, k === MONTHS ? null : monthStart(firstIndex + k))),
      ]),
    ),
  );
  const span = (column: (number | null)[], k: number): Span => {
    const [first, ...bounds] = column;
    // With nothing before the month, count from the first reading ever taken.
    return { start: bounds[k] ?? first, end: bounds[k + 1] };
  };
  return Array.from({ length: MONTHS }, (_, k) => ({
    month: monthKey(firstIndex + k),
    energy: energyUseMonth({ used: span(columns[0], k), regen: span(columns[1], k), odometerMiles: span(columns[2], k) }),
  }));
}
