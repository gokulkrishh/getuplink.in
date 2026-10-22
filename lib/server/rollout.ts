import "server-only";
import { DEMO } from "@/lib/demo";
import { buildRollout, GLOBAL_RELEASES, type Rollout, type RolloutChange } from "@/lib/rollout";
import { type Arriving, buildArriving, type OfferedCar, yourCar, type YourCar } from "@/lib/rollout-arriving";
import { buildStateRollout, type VersionStates } from "@/lib/rollout-states";
import { UPDATE_FIELDS } from "@/lib/telemetry";
import { loadCarState, type Vehicle } from "./dashboard";
import { demoData, demoFleet } from "./demo";
import { missingEnv } from "./env";
import { carStates } from "./home-state";
import { db } from "./supabase";

// This goes to the browser (the page's "use cache: private"), so it holds totals and the owner's own line only.
export type RolloutPage =
  | { kind: "ready"; rollout: Rollout; states: VersionStates[]; arriving: Arriving[]; yourCar: YourCar | null }
  | { kind: "error"; message: string };

type OwnCar = Omit<OfferedCar, "car"> | null;

// The version totals, for each version cars run now its states, what's on offer, and the owner's line.
// None of them carries a car key out.
function build(
  cars: Awaited<ReturnType<typeof carStates>>,
  changes: RolloutChange[],
  globalReleases: Record<string, string>,
  offers: OfferedCar[],
  own: OwnCar,
): RolloutPage {
  const rollout = buildRollout(cars, changes, globalReleases);
  const versions = rollout.versions.flatMap((v) => (v.carsNow > 0 ? [v.version] : []));
  return {
    kind: "ready",
    rollout,
    states: buildStateRollout(cars, versions),
    arriving: buildArriving(offers),
    yourCar: own ? yourCar(own, rollout) : null,
  };
}

const PAGE = 1000; // PostgREST's default row cap per request

// Every version_history row across all cars, in pages of PAGE.
async function allChanges(): Promise<RolloutChange[]> {
  const rows: RolloutChange[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("version_history")
      .select("car:vehicle_id::text, version, previous:previous_version, at:detected_at, source")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as RolloutChange[]));
    if (data.length < PAGE) return rows;
  }
}

type OfferRow = { car: string; version: string | null; snapshots: { status: string | null; offered: string | null }[] };

// Every car's version and the update its last online check saw offered. Asleep and offline checks carry no
// update fields, so the last online one is the car's last known offer, as on /updates.
async function allOffers(): Promise<OfferedCar[]> {
  const { data, error } = await db()
    .from("vehicles")
    .select("car:id::text, version:current_version, snapshots(status:update_status, offered:update_version)")
    .eq("snapshots.state", "online")
    .order("polled_at", { referencedTable: "snapshots", ascending: false })
    .limit(1, { referencedTable: "snapshots" });
  if (error) throw new Error(error.message);
  return (data as unknown as OfferRow[]).map(({ car, version, snapshots }) => ({
    car,
    version,
    status: snapshots[0]?.status ?? null,
    offered: snapshots[0]?.offered ?? null,
  }));
}

// The owner's car (the one seen most recently, as on Settings) with its pending update as /updates shows
// it: the last online check with newer streamed update fields laid over it.
async function ownCar(): Promise<OwnCar> {
  let vehicle: Vehicle | null;
  if (DEMO) vehicle = demoData().vehicle;
  else {
    const { data, error } = await db()
      .from("vehicles")
      .select("id:id::text, vin, display_name, last_state, current_version, last_seen_at, last_polled_at, model, exterior_color")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    vehicle = data as Vehicle | null;
  }
  if (!vehicle) return null;
  const { lastOnline } = await loadCarState(vehicle, "normal", UPDATE_FIELDS);
  return { version: vehicle.current_version, status: lastOnline?.update_status ?? null, offered: lastOnline?.update_version ?? null };
}

// /rollout's totals, pooled across every car in the database. Only the totals leave this function: vehicle
// ids are opaque keys inside buildRollout and buildArriving, VINs only join tables inside carStates (and read
// the owner's own stream), and only versions, counts and the owner's own line leave the server.
export async function loadRollout(): Promise<RolloutPage> {
  if (DEMO) {
    const fleet = demoFleet();
    const changes = fleet.history.map((h) => ({ car: h.vehicle_id, version: h.version, previous: h.previous_version, at: h.detected_at, source: h.source }));
    const offers = fleet.vehicles.map((v) => {
      const offer = fleet.offers.find((o) => o.vehicle_id === v.id);
      return { car: v.id, version: v.current_version, status: offer?.update_status ?? null, offered: offer?.update_version ?? null };
    });
    return build(await carStates(), changes, fleet.globalReleases, offers, await ownCar());
  }
  try {
    const missing = missingEnv();
    if (missing.length) return { kind: "error", message: `Missing env vars: ${missing.join(", ")}` };
    // Every owner's cars count by default. The opt-out (phase 6, with per-owner settings) goes here: drop the
    // cars and rows of owners who turned it off before they reach buildRollout.
    const [cars, changes, offers, own] = await Promise.all([carStates(), allChanges(), allOffers(), ownCar()]);
    return build(cars, changes, GLOBAL_RELEASES, offers, own);
  } catch (err) {
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
