import "server-only";
import { DEMO } from "@/lib/demo";
import { isStateCode, mostCommonState, siteState, type StateCode } from "@/lib/india-states";
import { demoFleet } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { type FleetCar, fleetCars, fleetSuperchargerSites } from "./data/system";
import { hasScope, LOCATION_SCOPE } from "./tesla";

const PAGE = 1000; // PostgREST's default row cap per request
// Before the home_state migration (42703) or without the charging history table (42P01, PGRST205), a
// car simply has no state yet.
const MISSING = ["42703", "42P01", "PGRST205"];

export type HomeStateSource = "location" | "superchargers";
export type CarState = { car: string; version: string | null; state: StateCode | null; source: HomeStateSource | null };

type Site = { vehicle_vin: string | null; site_name: string | null };

// Each car's home state: the one its located checks found, or else the state of the Superchargers it
// uses most. `car` is the vehicle id as an opaque key; VINs only join the two tables here.
function homeStates(cars: FleetCar[], sites: Site[]): CarState[] {
  const byVin = new Map<string, (StateCode | null)[]>();
  for (const row of sites) {
    if (!row.vehicle_vin) continue;
    byVin.set(row.vehicle_vin, [...(byVin.get(row.vehicle_vin) ?? []), siteState(row.site_name)]);
  }
  return cars.map((v) => {
    if (isStateCode(v.home_state)) return { car: v.id, version: v.current_version, state: v.home_state, source: "location" };
    const guess = mostCommonState(v.vin ? (byVin.get(v.vin) ?? []) : []);
    return { car: v.id, version: v.current_version, state: guess, source: guess ? "superchargers" : null };
  });
}

// Every car's home state, for the rollout map's totals.
export async function carStates(): Promise<CarState[]> {
  if (DEMO) {
    return demoFleet().vehicles.map((v) => ({ car: v.id, version: v.current_version, state: v.home_state, source: v.home_state ? "location" : null }));
  }
  const [cars, sites] = await Promise.all([fleetCars(), fleetSuperchargerSites()]);
  return homeStates(cars, sites ?? []);
}

// The owner's Supercharger visits, oldest first.
async function ownSites(owner: Owner): Promise<Site[]> {
  const out: Site[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ownerDb(owner)
      .from("charging_sessions")
      .select("vehicle_vin, site_name")
      .order("started_at")
      .order("session_id")
      .range(from, from + PAGE - 1);
    if (error) {
      if (MISSING.includes(error.code)) return out;
      throw new Error(error.message);
    }
    out.push(...(data as Site[]));
    if (data.length < PAGE) return out;
  }
}

// The owner's cars, the one seen most recently first.
async function ownCars(owner: Owner): Promise<FleetCar[]> {
  const read = (columns: string) => ownerDb(owner).from("vehicles").select(columns).order("last_seen_at", { ascending: false, nullsFirst: false });
  let vehicles = await read("id:id::text, vin, current_version, home_state");
  if (vehicles.error && MISSING.includes(vehicles.error.code)) vehicles = await read("id:id::text, vin, current_version");
  if (vehicles.error) throw new Error(vehicles.error.message);
  // A select built from a string has no row type.
  return vehicles.data as unknown as FleetCar[];
}

export type OwnHomeState = { state: StateCode | null; source: HomeStateSource | null; locationAllowed: boolean; askLocation: boolean };

// For Settings: the owner's car (the one seen most recently) and whether Tesla lets Uplink read its location.
export async function ownHomeState(owner: Owner): Promise<OwnHomeState> {
  if (DEMO) return { state: "KA", source: "location", locationAllowed: true, askLocation: false };
  const [cars, sites, locationAllowed] = await Promise.all([ownCars(owner), ownSites(owner), hasScope(owner, LOCATION_SCOPE)]);
  const own = homeStates(cars.slice(0, 1), sites)[0];
  // Ask the owner to sign in again only once sign-in actually requests the scope.
  return { state: own?.state ?? null, source: own?.source ?? null, locationAllowed, askLocation: !locationAllowed };
}
