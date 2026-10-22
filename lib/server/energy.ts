import "server-only";
import { monthIndex, monthKey } from "@/lib/periods";
import { type EnergyMonth, type Span, energyUseMonth, num } from "@/lib/telemetry-derive";
import type { CounterColumn, CounterValue } from "@/lib/driving-figures";
import { DEMO } from "@/lib/demo";
import { demoCounters } from "./demo";
import { db } from "./supabase";

export type MonthlyEnergy = { month: string; energy: EnergyMonth | null };

const MONTHS = 12;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Passed as the last boundary, it stands for "now": the last reading before it is the latest one.
export const LATEST = "infinity";

function monthStart(index: number): string {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - IST_OFFSET_MS).toISOString();
}

// The month starts of the window, then LATEST, so bounds[k] opens window month k and bounds[k + 1] closes it.
export function monthBounds(firstIndex: number): string[] {
  return [...Array.from({ length: MONTHS }, (_, k) => monthStart(firstIndex + k)), LATEST];
}

export type { CounterColumn, CounterValue };
// A row from counter_values_at / snapshot_odometer_at: `at` is the boundary, or null for the first reading.
export type BoundRow = { at: string | null; value: number | null; readAt: string | null };

const instant = (at: string) => (at === LATEST ? Infinity : Date.parse(at));

// Places rows on their boundaries. Postgres echoes the boundary in its own format, so they match by instant.
export function toColumn(bounds: string[], rows: BoundRow[]): CounterColumn {
  const index = new Map(bounds.map((bound, k) => [instant(bound), k]));
  const column: CounterColumn = { first: null, bounds: bounds.map(() => null) };
  for (const row of rows) {
    if (row.value === null || !row.readAt) continue;
    const reading = { value: row.value, at: Date.parse(row.readAt) };
    if (row.at === null) column.first = reading;
    else {
      const k = index.get(instant(row.at));
      if (k !== undefined) column.bounds[k] = reading;
    }
  }
  return column;
}

// Counters at each boundary, per field, in one request. The counters only send a row when they change, so
// the last reading before a boundary is the value there. Null when the query fails.
export async function loadCounters(vin: string, fields: string[], bounds: string[]): Promise<Map<string, CounterColumn> | null> {
  if (DEMO) return demoCounters(fields, bounds.map((bound) => (bound === LATEST ? Infinity : Date.parse(bound))));
  const { data, error } = await db().rpc("counter_values_at", { p_vin: vin, p_fields: fields, p_at: bounds });
  if (error) {
    console.warn(`Telemetry ${fields.join(", ")} unavailable:`, error.message);
    return null;
  }
  const rows = data as { field: string; at: string | null; value: unknown; created_at: string | null }[];
  return new Map(
    fields.map((field) => [
      field,
      toColumn(
        bounds,
        rows.filter((row) => row.field === field).map((row) => ({ at: row.at, value: num(row.value), readAt: row.created_at })),
      ),
    ]),
  );
}

// Energy use per month for the last 12 months (IST), from the streamed lifetime counters and odometer.
// Months stay null until the counters cover them. Empty when there is no car or no reading.
export async function loadMonthlyEnergy(vin: string | null): Promise<MonthlyEnergy[]> {
  if (!vin) return [];
  const firstIndex = monthIndex(Date.now()) - (MONTHS - 1);
  const counters = await loadCounters(vin, ["LifetimeEnergyUsed", "LifetimeEnergyGainedRegen", "Odometer"], monthBounds(firstIndex));
  const span = (field: string, k: number): Span => {
    const column = counters?.get(field);
    // With nothing before the month, count from the first reading ever taken.
    return { start: (column?.bounds[k] ?? column?.first)?.value ?? null, end: column?.bounds[k + 1]?.value ?? null };
  };
  return Array.from({ length: MONTHS }, (_, k) => ({
    month: monthKey(firstIndex + k),
    energy: energyUseMonth({ used: span("LifetimeEnergyUsed", k), regen: span("LifetimeEnergyGainedRegen", k), odometerMiles: span("Odometer", k) }),
  }));
}
