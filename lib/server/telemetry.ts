import "server-only";
import { db } from "./supabase";
import type { Stream } from "@/lib/telemetry";

export { applyStream } from "@/lib/telemetry";

const FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes",
  "BatteryLevel",
  "RatedRange",
  "ChargeLimitSoc",
  "DetailedChargeState",
];

// Latest Fleet Telemetry reading per field. Rows only arrive when a value changes, so a field's
// latest row can be days old. One small query per field: the (vin, field, created_at) index serves each.
// Telemetry is a bonus on top of the poll, so a failed query just means no stream.
export async function loadStream(vin: string): Promise<Stream> {
  const results = await Promise.all(
    FIELDS.map(async (field) => {
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
