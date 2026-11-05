import "server-only";
import { DEMO } from "@/lib/demo";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { buildRollout, GLOBAL_RELEASES, type Rollout, type RolloutChange } from "@/lib/rollout";
import { type Adoption, type AdoptionGrain, buildAdoption } from "@/lib/rollout-adoption";
import { type Arriving, buildArriving, type OfferedCar, withOwnOffer, yourCar, type YourCar } from "@/lib/rollout-arriving";
import { type RolloutGlance, rolloutGlance } from "@/lib/rollout-line";
import { buildStateRollout, type VersionStates } from "@/lib/rollout-states";
import { UPDATE_FIELDS } from "@/lib/telemetry";
import { loadCarState, loadReleaseNotes, type Vehicle } from "./dashboard";
import { demoData, demoFleet } from "./demo";
import { missingEnv } from "./env";
import { carStates } from "./home-state";
import { hides, type Owner, ownerDb } from "./data/owner";
import { fleetCars, fleetOffers, fleetVersionChanges } from "./data/system";

// This goes to the browser (the page's "use cache: private"), so it holds totals and the owner's own line only.
export type RolloutPage =
  | {
      kind: "ready";
      rollout: Rollout;
      states: VersionStates[];
      arriving: Arriving[];
      yourCar: YourCar | null;
      adoption: Record<AdoptionGrain, Adoption>;
      // Tesla's notes for the versions on the page; the same for every car on a version.
      releaseNotes: ReleaseNotesByVersion;
    }
  | { kind: "error"; message: string };

type OwnCar = OfferedCar | null;

// The version totals, for each version cars run now its states, what's on offer, the owner's line, how
// each version spread day by day and week by week, and the notes. None of them carries a car key out.
// `extraNotes` are the demo fleet's, for versions the demo car never ran.
async function build(
  cars: Awaited<ReturnType<typeof carStates>>,
  changes: RolloutChange[],
  globalReleases: Record<string, string>,
  offers: OfferedCar[],
  own: OwnCar,
  now: number,
  extraNotes: ReleaseNotesByVersion = {},
): Promise<RolloutPage> {
  const rollout = buildRollout(cars, changes, globalReleases);
  const versions = rollout.versions.flatMap((v) => (v.carsNow > 0 ? [v.version] : []));
  const arriving = buildArriving(withOwnOffer(offers, own));
  const shown = [...new Set([...rollout.versions.map((v) => v.version), ...arriving.map((a) => a.version)])];
  const notes = await loadReleaseNotes(shown);
  return {
    kind: "ready",
    rollout,
    states: buildStateRollout(cars, versions),
    arriving,
    yourCar: own ? yourCar(own, rollout) : null,
    adoption: { day: buildAdoption(cars, changes, now, "day"), week: buildAdoption(cars, changes, now, "week") },
    releaseNotes: { ...Object.fromEntries(Object.entries(extraNotes).filter(([v]) => shown.includes(v))), ...notes },
  };
}

// The owner's car (the one seen most recently, as on Settings) with its pending update as /updates shows
// it: the last online check with newer streamed update fields laid over it.
async function ownCar(owner: Owner, now: number): Promise<OwnCar> {
  let vehicle: Vehicle | null;
  if (DEMO) vehicle = demoData().vehicle;
  else {
    const { data, error } = await ownerDb(owner)
      .from("vehicles")
      .select("id:id::text, vin, display_name, last_state, current_version, last_seen_at, last_polled_at, model, exterior_color")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    vehicle = data as Vehicle | null;
  }
  if (!vehicle) return null;
  const { lastOnline } = await loadCarState(owner, vehicle, "normal", now, UPDATE_FIELDS);
  return { car: vehicle.id, version: vehicle.current_version, status: lastOnline?.update_status ?? null, offered: lastOnline?.update_version ?? null };
}

// The India rollout's totals, pooled across every car in the database. Only the totals leave this function: vehicle
// ids are opaque keys inside buildRollout and buildArriving, VINs only join tables inside carStates (and read
// the owner's own stream), and only versions, counts and the owner's own line leave the server.
// A view link that hides locations gets no state map: with few cars in Uplink, the states could show where
// the owner's car is.
export async function loadRollout(owner: Owner, now: number): Promise<RolloutPage> {
  const page = await readRollout(owner, now);
  return page.kind === "ready" && hides(owner, "locations") ? { ...page, states: [] } : page;
}

async function readRollout(owner: Owner, now: number): Promise<RolloutPage> {
  if (DEMO) {
    const fleet = demoFleet();
    const changes = fleet.history.map((h) => ({ car: h.vehicle_id, version: h.version, previous: h.previous_version, at: h.detected_at, source: h.source }));
    const offers = fleet.vehicles.map((v) => {
      const offer = fleet.offers.find((o) => o.vehicle_id === v.id);
      return { car: v.id, version: v.current_version, status: offer?.update_status ?? null, offered: offer?.update_version ?? null };
    });
    return build(await carStates(), changes, fleet.globalReleases, offers, await ownCar(owner, now), now, fleet.notes);
  }
  try {
    const missing = missingEnv();
    if (missing.length) return { kind: "error", message: `Missing env vars: ${missing.join(", ")}` };
    // Every owner's cars count by default. The opt-out (phase 6, with per-owner settings) goes here: drop the
    // cars and rows of owners who turned it off before they reach buildRollout.
    const [cars, changes, offers, own] = await Promise.all([carStates(), fleetVersionChanges(), fleetOffers(), ownCar(owner, now)]);
    return await build(cars, changes, GLOBAL_RELEASES, offers, own, now);
  } catch (err) {
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}

// The few totals the Updates page shows under the Software card: how many cars run each version and what is
// on offer. The same cars and offers as the India rollout, without its states, history and notes. Null when they
// can't be read, so the page still loads without the line.
export async function loadRolloutGlance(): Promise<RolloutGlance | null> {
  if (DEMO) {
    const fleet = demoFleet();
    const offers = fleet.vehicles.map((v) => {
      const offer = fleet.offers.find((o) => o.vehicle_id === v.id);
      return { car: v.id, version: v.current_version, status: offer?.update_status ?? null, offered: offer?.update_version ?? null };
    });
    return rolloutGlance(fleet.vehicles.map((v) => ({ car: v.id, version: v.current_version })), offers);
  }
  try {
    if (missingEnv().length) return null;
    const [cars, offers] = await Promise.all([fleetCars(), fleetOffers()]);
    return rolloutGlance(cars.map((c) => ({ car: c.id, version: c.current_version })), offers);
  } catch (err) {
    console.error(err);
    return null;
  }
}
