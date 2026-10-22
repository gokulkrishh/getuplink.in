import "server-only";
import { DEMO } from "@/lib/demo";
import { stationAt } from "@/lib/stations";
import { syncStreamSessionsSafely } from "./stream-charging";
import { db } from "./supabase";
import { fleetGet, hasScope, LOCATION_SCOPE, TeslaError } from "./tesla";

const MIN = 60 * 1000;
// A session that ended this recently may still have the car at the charger.
const ENDED_WITHIN_MS = 30 * MIN;
// An open session older than this is a leftover the next rebuild will close, not a charge in progress.
const OPEN_WITHIN_MS = 12 * 60 * MIN;
// Readings that only come while charging; one in this window means the sessions are worth a rebuild.
const CHARGING_FIELDS = ["DetailedChargeState", "ACChargingPower", "DCChargingPower", "ACChargingEnergyIn", "DCChargingEnergyIn"];
const RECENT_MS = 45 * MIN;

type FleetVehicle = { vin: string; state: string };
type VehicleData = {
  charge_state?: { charging_state?: string };
  drive_state?: { latitude?: number; longitude?: number; native_latitude?: number; native_longitude?: number };
};

export type StationCheckResult = { sessions: number; labelled: number; skipped?: string };

// Rebuilds sessions only for cars that streamed charging readings lately: the poll runs every 6 hours,
// so without this a charge in progress wouldn't be in the table yet. Database only, no Tesla call.
async function syncChargingCars(): Promise<void> {
  const { data, error } = await db().from("vehicles").select("vin");
  if (error) return;
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const charging: string[] = [];
  for (const { vin } of data ?? []) {
    if (!vin) continue;
    const recent = await db()
      .from("telemetry_readings")
      .select("id")
      .eq("vin", vin)
      .in("field", CHARGING_FIELDS)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (recent.data) charging.push(vin as string);
  }
  await syncStreamSessionsSafely(charging);
}

// Unlabelled, unchecked sessions in progress or just ended. Superchargers are left out: Tesla names those.
async function pending(): Promise<{ id: number; vin: string; ended_at: string | null }[] | null> {
  const now = Date.now();
  const { data, error } = await db()
    .from("stream_charge_sessions")
    .select("id, vin, ended_at")
    .is("station_checked_at", null)
    .eq("supercharger", false)
    .gte("started_at", new Date(now - OPEN_WITHIN_MS).toISOString())
    .or(`ended_at.is.null,ended_at.gte.${new Date(now - ENDED_WITHIN_MS).toISOString()}`);
  // Before the migration the columns are missing: nothing to label.
  if (error) {
    console.warn("Station check unavailable:", error.message);
    return null;
  }
  return (data ?? []) as { id: number; vin: string; ended_at: string | null }[];
}

// Marks sessions as tried, only those no other run has claimed, so a double-fired cron can't read the
// car twice. Returns the ids this run now owns.
async function claim(ids: number[], at: string): Promise<number[]> {
  const { data, error } = await db()
    .from("stream_charge_sessions")
    .update({ station_checked_at: at })
    .in("id", ids)
    .is("station_checked_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as number);
}

// Reads the car's location once, names the station it's at, and drops the location. The coordinates
// never leave this function: not stored, logged or returned.
async function stationNow(vin: string): Promise<{ label: string | null; atCharger: boolean } | null> {
  let data: VehicleData;
  try {
    data =
      (await fleetGet<VehicleData>(`/api/1/vehicles/${vin}/vehicle_data?endpoints=${encodeURIComponent("charge_state;drive_state;location_data")}`)) ?? {};
  } catch (err) {
    // 408: asleep after all; 403: the location scope was withdrawn. Either way, no second try.
    if (err instanceof TeslaError && (err.status === 408 || err.status === 403)) return null;
    throw err;
  }
  const drive = data.drive_state;
  delete data.drive_state;
  const lat = drive?.latitude ?? drive?.native_latitude;
  const lon = drive?.longitude ?? drive?.native_longitude;
  const label = typeof lat === "number" && typeof lon === "number" ? stationAt(lat, lon) : null;
  // Unplugged, the car may have driven off: its location is no longer the charger's.
  const state = data.charge_state?.charging_state;
  return { label, atCharger: Boolean(state) && state !== "Disconnected" };
}

// Every 15 minutes (app/api/cron/stations). Costs nothing at Tesla unless a session needs a name, and
// then at most one vehicle_data call per car for its unlabelled sessions, each session tried once.
export async function checkStations(): Promise<StationCheckResult> {
  if (DEMO) return { sessions: 0, labelled: 0, skipped: "demo" };
  await syncChargingCars();
  const rows = await pending();
  if (!rows || rows.length === 0) return { sessions: 0, labelled: 0 };
  if (!(await hasScope(LOCATION_SCOPE).catch(() => false))) return { sessions: rows.length, labelled: 0, skipped: "no location scope" };

  const listed = await fleetGet<FleetVehicle[]>("/api/1/vehicles");
  const online = new Set((Array.isArray(listed) ? listed : []).filter((v) => v.state === "online").map((v) => v.vin));
  const now = new Date().toISOString();
  let labelled = 0;
  for (const vin of new Set(rows.map((r) => r.vin))) {
    const mine = rows.filter((r) => r.vin === vin);
    // Never wake the car. An open session waits for a later run; an ended one is given up on.
    if (!online.has(vin)) {
      const ended = mine.filter((r) => r.ended_at).map((r) => r.id);
      if (ended.length > 0) await claim(ended, now);
      continue;
    }
    const ids = await claim(
      mine.map((r) => r.id),
      now,
    );
    if (ids.length === 0) continue;
    const found = await stationNow(vin);
    // An ended session only takes the name while the car is still plugged in.
    const named = found?.label ? ids.filter((id) => found.atCharger || !mine.find((r) => r.id === id)?.ended_at) : [];
    // Yes/no only: never the location or the station.
    console.info(`Station check: location ${found ? "read" : "not read"}, station ${found?.label ? "found" : "not found"}`);
    if (named.length > 0) {
      const { error } = await db().from("stream_charge_sessions").update({ station_name: found!.label }).in("id", named);
      if (error) throw new Error(error.message);
      labelled += named.length;
    }
  }
  return { sessions: rows.length, labelled };
}
