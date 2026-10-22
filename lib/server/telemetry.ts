import "server-only";
import { DEMO } from "@/lib/demo";
import { demoData, demoLastReadingAt, demoReadings, demoStream } from "./demo";
import { db } from "./supabase";
import type { Stream } from "@/lib/telemetry";
import type { Reading } from "@/lib/telemetry-derive";

export { applyStream } from "@/lib/telemetry";

export const STREAM_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
  "BatteryLevel",
  "RatedRange",
  "ChargeLimitSoc",
  "DetailedChargeState",
  "ACChargingPower",
  "DCChargingPower",
  "TimeToFullCharge",
];

// Latest Fleet Telemetry reading per field (STREAM_FIELDS unless given). Rows only arrive when a value
// changes, so a field's latest row can be days old. One small query per field: the (vin, field, created_at)
// index serves each. Telemetry is a bonus on top of the poll, so a failed query just means no stream.
export async function loadStream(vin: string, fields: string[] = STREAM_FIELDS): Promise<Stream> {
  if (DEMO) return demoStream(fields);
  const results = await Promise.all(
    fields.map(async (field) => {
      const { data, error } = await db()
        .from("telemetry_readings")
        .select("created_at, value")
        .eq("vin", vin)
        .eq("field", field)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn(`Telemetry ${field} unavailable:`, error.message);
        return null;
      }
      return data ? ([field, { at: data.created_at as string, value: data.value as unknown }] as const) : null;
    }),
  );
  return Object.fromEntries(results.filter((r) => r !== null));
}

export const PAGE = 1000;
export const MAX_PAGES = 20;

// One field's readings in a time window, oldest first. PostgREST caps a response at 1000 rows, so this
// pages through with .range(), up to MAX_PAGES. Null when the query fails (telemetry is a bonus).
export async function loadReadings(vin: string, field: string, from: string, to?: string): Promise<Reading[] | null> {
  if (DEMO) return demoReadings(field, from, to);
  const rows: Reading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = db().from("telemetry_readings").select("created_at, value").eq("vin", vin).eq("field", field).gte("created_at", from);
    if (to) query = query.lt("created_at", to);
    const { data, error } = await query.order("created_at", { ascending: true }).range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) {
      console.warn(`Telemetry ${field} unavailable:`, error.message);
      return null;
    }
    rows.push(...(data ?? []).map((r) => ({ at: r.created_at as string, value: r.value as unknown })));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

// The connected car's id and VIN, read once per page and handed to the loaders that need them.
export async function loadPrimaryVehicle(): Promise<{ id: string; vin: string } | null> {
  if (DEMO) return { id: demoData().vehicle.id, vin: demoData().vin };
  const { data, error } = await db().from("vehicles").select("id:id::text, vin").not("vin", "is", null).order("created_at").limit(1).maybeSingle();
  if (error) {
    console.warn("Vehicle VIN unavailable:", error.message);
    return null;
  }
  return data ? { id: data.id as string, vin: data.vin as string } : null;
}

// When the newest streamed reading arrived, or null when there are none (or the query fails).
export async function lastReadingAt(): Promise<string | null> {
  if (DEMO) return demoLastReadingAt();
  const { data, error } = await db()
    .from("telemetry_readings")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Last reading unavailable:", error.message);
    return null;
  }
  return (data?.created_at as string | undefined) ?? null;
}
