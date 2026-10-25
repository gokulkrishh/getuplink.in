import "server-only";
import { num } from "@/lib/telemetry-derive";
import type { CounterColumn, CounterValue } from "@/lib/driving-figures";
import { DEMO } from "@/lib/demo";
import { demoCounters } from "./demo";
import { type Owner, ownerDb } from "./data/owner";

// Cumulative counters at chosen instants, from the streamed readings (see loadDrivingFigures).

// Passed as the last boundary, it stands for "now": the last reading before it is the latest one.
export const LATEST = "infinity";

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
export async function loadCounters(owner: Owner, vin: string, fields: string[], bounds: string[]): Promise<Map<string, CounterColumn> | null> {
  if (DEMO) return demoCounters(fields, bounds.map((bound) => (bound === LATEST ? Infinity : Date.parse(bound))));
  const { data, error } = await ownerDb(owner).rpc("counter_values_at", { p_vin: vin, p_fields: fields, p_at: bounds });
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
