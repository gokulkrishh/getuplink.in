import "server-only";
import { awakeDays, type DayStrip, type Poll, PRESENCE_FIELDS } from "@/lib/awake";
import { DEMO } from "@/lib/demo";
import { demoPolls } from "./demo/awake";
import { type Owner, ownerDb } from "./data/owner";
import { loadReadingsByField } from "./telemetry-window";

export const AWAKE_DAYS = 14;

// The poll's checks in a window, oldest first. Only the time and state, never the raw payload.
async function loadPolls(owner: Owner, vehicleId: string, from: string): Promise<Poll[]> {
  if (DEMO) return demoPolls(AWAKE_DAYS);
  const { data, error } = await ownerDb(owner).from("snapshots").select("polled_at, state").eq("vehicle_id", vehicleId).gte("polled_at", from).order("polled_at", { ascending: true });
  if (error) {
    console.warn("Snapshot states unavailable:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ at: Date.parse(r.polled_at as string), state: r.state as string }));
}

// Online, asleep and offline per IST day for the last 14 days (see awakeDays), and when the car last sent
// one of the presence fields: they change every few minutes while it is awake, so this says whether it is
// awake now without reading every field's latest value.
export async function loadPresence(owner: Owner, vehicle: { id: string; vin: string } | null, now: number): Promise<{ days: DayStrip[]; newest: string | null }> {
  if (!vehicle) return { days: [], newest: null };
  const from = new Date(now - (AWAKE_DAYS + 1) * 86_400_000).toISOString();
  const [polls, readings] = await Promise.all([loadPolls(owner, vehicle.id, from), loadReadingsByField(owner, vehicle.vin, PRESENCE_FIELDS, from, new Date(now).toISOString())]);
  const times = Object.values(readings ?? {}).flatMap((rows) => rows.map((r) => Date.parse(r.at)));
  const latest = times.reduce((max, t) => Math.max(max, t), 0);
  const newest = latest > 0 ? new Date(latest).toISOString() : null;
  return { days: awakeDays(times, polls, now, AWAKE_DAYS), newest };
}
