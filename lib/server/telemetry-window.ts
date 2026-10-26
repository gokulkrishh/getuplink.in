import "server-only";
import { firstArrival, TYRE_SEEN_FIELDS } from "@/lib/car-now";
import { DEMO } from "@/lib/demo";
import type { Reading } from "@/lib/telemetry-derive";
import { demoReadings } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { MAX_PAGES, PAGE } from "./telemetry";

// Several fields' readings in one window [from, to), by field, oldest first: one query instead of one
// per field. Rows come ordered by field then time, which the (vin, field, created_at) index serves, and
// the fixed upper bound keeps the offsets still while pages load. The first page brings the row count,
// so the rest are fetched together. The page cap is the per-field one pooled (MAX_PAGES per field), so
// past it the fields last in name order lose rows first. Null when the query fails (telemetry is a bonus).
export async function loadReadingsByField(owner: Owner, vin: string, fields: string[], from: string, to: string): Promise<Record<string, Reading[]> | null> {
  if (DEMO) return Object.fromEntries(fields.map((field) => [field, demoReadings(field, from, to)]));
  const page = (k: number, count?: "exact") =>
    ownerDb(owner)
      .readings("field, created_at, value", { count })
      .eq("vin", vin)
      .in("field", fields)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("field", { ascending: true })
      .order("created_at", { ascending: true })
      .range(k * PAGE, (k + 1) * PAGE - 1);
  const first = await page(0, "exact");
  const total = first.count ?? first.data?.length ?? 0;
  const pages = Math.min(Math.ceil(total / PAGE), MAX_PAGES * fields.length);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, k) => page(k + 1)));
  const byField: Record<string, Reading[]> = Object.fromEntries(fields.map((field) => [field, []]));
  for (const { data, error } of [first, ...rest]) {
    if (error) {
      console.warn("Telemetry window unavailable:", error.message);
      return null;
    }
    for (const r of data ?? []) byField[r.field as string]?.push({ at: r.created_at as string, value: r.value as unknown });
  }
  return byField;
}

export const TYRE_ARRIVAL_DAYS = 14;

// When each tyre's current TpmsLastSeenPressureTime* value first arrived (see firstArrival), from the last
// TYRE_ARRIVAL_DAYS of readings: carNow needs it to tell a real measured time from a wrong one. Null for a
// tyre whose value goes back further, or when the read fails.
export async function loadTyreArrivals(owner: Owner, vin: string, now: number): Promise<Record<string, string | null>> {
  const readings = await loadReadingsByField(owner, vin, TYRE_SEEN_FIELDS, new Date(now - TYRE_ARRIVAL_DAYS * 86_400_000).toISOString(), new Date(now + 1).toISOString());
  return Object.fromEntries(TYRE_SEEN_FIELDS.map((field) => [field, readings ? firstArrival(readings[field] ?? []) : null]));
}
