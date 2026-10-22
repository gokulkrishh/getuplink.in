import "server-only";
import { DEMO } from "@/lib/demo";
import { isStateCode, mostCommonState, siteState, type StateCode } from "@/lib/india-states";
import { demoFleet } from "./demo";
import { db } from "./supabase";
import { hasScope, LOCATION_REQUESTED, LOCATION_SCOPE } from "./tesla";

const PAGE = 1000; // PostgREST's default row cap per request
// Before the home_state migration (42703) or without the charging history table (42P01, PGRST205), a
// car simply has no state yet.
const MISSING = ["42703", "42P01", "PGRST205"];

export type HomeStateSource = "location" | "superchargers";
export type CarState = { car: string; version: string | null; state: StateCode | null; source: HomeStateSource | null };

// Every Supercharger visit's state per VIN, oldest first.
async function siteStates(): Promise<Map<string, (StateCode | null)[]>> {
  const byVin = new Map<string, (StateCode | null)[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("charging_sessions")
      .select("vehicle_vin, site_name")
      .order("started_at")
      .range(from, from + PAGE - 1);
    if (error) {
      if (MISSING.includes(error.code)) return byVin;
      throw new Error(error.message);
    }
    for (const row of data) {
      if (!row.vehicle_vin) continue;
      byVin.set(row.vehicle_vin, [...(byVin.get(row.vehicle_vin) ?? []), siteState(row.site_name)]);
    }
    if (data.length < PAGE) return byVin;
  }
}

// Each car's home state: the one its located checks found, or else the state of the Superchargers it
// uses most. `car` is the vehicle id as an opaque key; VINs only join the two tables here.
export async function carStates(): Promise<CarState[]> {
  if (DEMO) {
    return demoFleet().vehicles.map((v) => ({ car: v.id, version: v.current_version, state: v.home_state, source: v.home_state ? "location" : null }));
  }
  let vehicles = await db().from("vehicles").select("id:id::text, vin, current_version, home_state");
  if (vehicles.error && MISSING.includes(vehicles.error.code)) {
    vehicles = await db().from("vehicles").select("id:id::text, vin, current_version");
  }
  if (vehicles.error) throw new Error(vehicles.error.message);
  const sites = await siteStates();
  return (vehicles.data as { id: string; vin: string | null; current_version: string | null; home_state?: string | null }[]).map((v) => {
    if (isStateCode(v.home_state)) return { car: v.id, version: v.current_version, state: v.home_state, source: "location" };
    const guess = mostCommonState(v.vin ? (sites.get(v.vin) ?? []) : []);
    return { car: v.id, version: v.current_version, state: guess, source: guess ? "superchargers" : null };
  });
}

export type OwnHomeState = { state: StateCode | null; source: HomeStateSource | null; locationAllowed: boolean; askLocation: boolean };

// For Settings: the owner's car (the one seen most recently) and whether Tesla lets Uplink read its location.
export async function ownHomeState(): Promise<OwnHomeState> {
  if (DEMO) return { state: "KA", source: "location", locationAllowed: true, askLocation: false };
  const [cars, latest, locationAllowed] = await Promise.all([
    carStates(),
    db().from("vehicles").select("id:id::text").order("last_seen_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    hasScope(LOCATION_SCOPE),
  ]);
  if (latest.error) throw new Error(latest.error.message);
  const own = cars.find((c) => c.car === latest.data?.id);
  // Ask the owner to sign in again only once sign-in actually requests the scope.
  return { state: own?.state ?? null, source: own?.source ?? null, locationAllowed, askLocation: LOCATION_REQUESTED && !locationAllowed };
}
