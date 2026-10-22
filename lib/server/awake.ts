import "server-only";
import { awakeDays, type DayStrip, type Poll } from "@/lib/awake";
import { DEMO } from "@/lib/demo";
import { demoPolls } from "./demo/awake";
import { db } from "./supabase";
import { loadReadingsByField } from "./telemetry-window";

export const AWAKE_DAYS = 14;

// Fields that change every few minutes while the car is awake (the pack drains, the counter ticks), plus
// update downloads. A scan across every field would not be served by the (vin, field, created_at) index.
const PRESENCE_FIELDS = ["EnergyRemaining", "LifetimeEnergyUsed", "SoftwareUpdateDownloadPercentComplete"];

// The poll's checks in a window, oldest first. Only the time and state, never the raw payload.
async function loadPolls(vehicleId: string, from: string): Promise<Poll[]> {
  if (DEMO) return demoPolls(AWAKE_DAYS);
  const { data, error } = await db().from("snapshots").select("polled_at, state").eq("vehicle_id", vehicleId).gte("polled_at", from).order("polled_at", { ascending: true });
  if (error) {
    console.warn("Snapshot states unavailable:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ at: Date.parse(r.polled_at as string), state: r.state as string }));
}

// Online, asleep and offline per IST day for the last 14 days (see awakeDays).
export async function loadAwake(vehicle: { id: string; vin: string } | null, now: number): Promise<DayStrip[]> {
  if (!vehicle) return [];
  const from = new Date(now - (AWAKE_DAYS + 1) * 86_400_000).toISOString();
  const [polls, readings] = await Promise.all([loadPolls(vehicle.id, from), loadReadingsByField(vehicle.vin, PRESENCE_FIELDS, from, new Date(now).toISOString())]);
  const times = Object.values(readings ?? {}).flatMap((rows) => rows.map((r) => Date.parse(r.at)));
  return awakeDays(times, polls, now, AWAKE_DAYS);
}
