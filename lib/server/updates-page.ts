import "server-only";
import type { Owner } from "./data/owner";
import type { DayStrip } from "@/lib/awake";
import { DEMO, type DemoScenario } from "@/lib/demo";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import { UPDATE_FIELDS } from "@/lib/telemetry";
import type { UpdateRow } from "@/lib/telemetry-derive";
import { loadPresence } from "./awake";
import {
  type CarState,
  loadCarState,
  loadHistory,
  loadOwnerCars,
  loadReleaseNotes,
  type OwnerGate,
  type PollRun,
  type Vehicle,
  type VersionChange,
  versionsOnScreen,
  withTimelines,
} from "./dashboard";

export type UpdatesCar = Omit<CarState, "flags"> & {
  vehicle: Vehicle;
  history: VersionChange[];
  // Real updates only, oldest first, for the stats.
  updates: UpdateRow[];
  // Online and asleep for the last 14 days.
  awake: DayStrip[];
};

export type UpdatesPage = OwnerGate | { kind: "ready"; cars: UpdatesCar[]; lastRun: PollRun | null; releaseNotes: ReleaseNotesByVersion };

// The rows updateStats needs, from the history already read (it holds the last 100 versions).
function updateRows(history: VersionChange[]): UpdateRow[] {
  return history
    .filter((h) => h.previous_version)
    .map((h) => ({ detected_at: h.detected_at, available_at: h.available_at }))
    .reverse();
}

async function updatesCar(owner: Owner, vehicle: Vehicle, scenario: DemoScenario, now: number): Promise<UpdatesCar> {
  const [state, history, presence] = await Promise.all([
    // Only the update fields: the page shows no battery.
    loadCarState(owner, vehicle, scenario, UPDATE_FIELDS),
    loadHistory(owner, vehicle).then((rows) => (vehicle.vin ? withTimelines(owner, vehicle.vin, rows) : rows)),
    loadPresence(owner, vehicle.vin ? { id: vehicle.id, vin: vehicle.vin } : null, now),
  ]);
  // The update fields rarely change; the presence fields stream every few minutes while the car is awake.
  const latest = Math.max(state.streamAt ? Date.parse(state.streamAt) : 0, presence.newest ? Date.parse(presence.newest) : 0);
  return {
    vehicle,
    // Not the flags read with the state: the page shows no notices.
    latest: state.latest,
    lastOnline: state.lastOnline,
    sentry: state.sentry,
    streamAt: latest > 0 ? new Date(latest).toISOString() : null,
    history,
    updates: updateRows(history),
    awake: presence.days,
  };
}

// Everything /updates shows, for each car. It only reads (snapshots, history, streamed readings), so
// nothing here wakes the car.
export async function loadUpdatesPage(owner: Owner, scenario: DemoScenario, now: number): Promise<UpdatesPage> {
  try {
    const account = await loadOwnerCars(owner);
    if (account.kind !== "ready") return account;
    const cars = await Promise.all(account.vehicles.map((v) => updatesCar(owner, v, scenario, now)));
    return { kind: "ready", cars, lastRun: account.lastRun, releaseNotes: await loadReleaseNotes(versionsOnScreen(cars)) };
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
