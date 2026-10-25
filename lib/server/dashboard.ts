import "server-only";
import { DEMO, type DemoScenario } from "@/lib/demo";
import { parseReleaseNotes, type ReleaseNote, type ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Stream } from "@/lib/telemetry";
import { type Reading, type UpdateTimeline, updateTimeline } from "@/lib/telemetry-derive";
import { carFlagsFrom, type CarFlagsNow, demoCarFlags, FLAG_COLUMNS, FLAG_KEYS } from "./car-flags";
import { demoData, demoStream } from "./demo";
import { missingEnv } from "./env";
import { db } from "./supabase";
import { applyStream, loadStream, STREAM_FIELDS } from "./telemetry";
import { loadReadingsByField } from "./telemetry-window";
import { withoutStaleTokenError } from "@/lib/run-error";
import { isConnected, tokensSavedAt } from "./tesla";

// Tags every page's "use cache: private" loader, so actions that change the owner's data or session
// can drop those cached copies with one updateTag.
export const OWNER_DATA_TAG = "owner-data";

export type Vehicle = {
  id: string; // live data is read as text so 17-digit Tesla ids keep precision
  vin: string | null;
  display_name: string | null;
  last_state: string | null;
  current_version: string | null;
  last_seen_at: string | null;
  last_polled_at: string | null;
  model: string | null;
  exterior_color: string | null;
};

export type Snapshot = {
  polled_at: string;
  state: string;
  car_version: string | null;
  update_status: string | null;
  update_version: string | null;
  download_perc: number | null;
  install_perc: number | null;
  expected_duration_sec: number | null;
  scheduled_time_ms: number | null;
  battery_level: number | null;
  battery_range_km: number | null;
  charging_state: string | null;
  charge_limit: number | null;
  // Live charging power in kW, from Fleet Telemetry only (null from polls).
  charge_power_kw: number | null;
  // Hours until the charge limit, from Fleet Telemetry only (null from polls).
  time_to_full_h: number | null;
  error: string | null;
};

export type VersionChange = {
  version: string;
  previous_version: string | null;
  detected_at: string;
  available_at: string | null; // first check that saw it offered as an update
  odometer_km: number | null;
  // How long its download and install took, when the streamed readings cover it.
  timeline?: UpdateTimeline;
};

export type PollRun = { started_at: string; ok: boolean | null; error: string | null };

// Why a page has no cars to show, or the cars: the same gate on every page that reads the car's state.
export type OwnerGate = { kind: "misconfigured"; missing: string[] } | { kind: "error"; message: string } | { kind: "disconnected" };

// The car's latest check, its last online check with newer streamed values laid over it, and when it last
// streamed one of the fields read.
export type CarState = {
  latest: Snapshot | null;
  // Most recent snapshot taken while the car was online: the last known update status.
  lastOnline: Snapshot | null;
  // When the car last streamed anything (any of the fields we read), or null when it never has.
  streamAt: string | null;
  // What Tesla flagged at that last online check (see loadCarFlags), read with it.
  flags: CarFlagsNow;
};

const SNAPSHOT_COLUMNS =
  "polled_at, state, car_version, update_status, update_version, download_perc, install_perc, expected_duration_sec, scheduled_time_ms, battery_level, battery_range_km, charging_state, charge_limit, error";

const DAY_MS = 86_400_000;

const TIMELINE_FIELDS = [
  "SoftwareUpdateVersion",
  "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateInstallationPercentComplete",
  "Version",
  "SoftwareUpdateInProgress",
];

// Download and install durations for the versions in history, from the streamed update fields. These only
// change during an update, so one read of the five fields from the oldest version on screen stays small.
// Anything that can't be read just leaves the rows without timings.
export async function withTimelines(vin: string, history: VersionChange[]): Promise<VersionChange[]> {
  if (history.length === 0) return history;
  const from = new Date(Date.parse(history[history.length - 1].detected_at) - 14 * DAY_MS).toISOString();
  const readings = await loadReadingsByField(vin, TIMELINE_FIELDS, from, new Date().toISOString());
  if (!readings) return history;
  const [pending, download, install, installed, started] = TIMELINE_FIELDS.map((field) => readings[field]);
  // The readings around one version: from two weeks before it was detected to a day after.
  const within = (readings: Reading[], start: number, end: number) => readings.filter((r) => Date.parse(r.at) >= start && Date.parse(r.at) <= end);
  return history.map((change) => {
    const detected = Date.parse(change.detected_at);
    const [start, end] = [detected - 14 * DAY_MS, detected + DAY_MS];
    const timeline = updateTimeline(change.version, {
      pending: within(pending, start, end),
      download: within(download, start, end),
      install: within(install, start, end),
      installed: within(installed, start, end),
      started: within(started, start, end),
    });
    return timeline ? { ...change, timeline } : change;
  });
}

// When the car last streamed anything, from the latest reading per field.
function newestReading(stream: Stream): string | null {
  const times = Object.values<{ at: string }>(stream).map((r) => Date.parse(r.at));
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

// See CarState. `fields` are the stream fields to read; streamAt only covers those.
export async function loadCarState(vehicle: Pick<Vehicle, "id" | "vin">, scenario: DemoScenario, fields: string[] = STREAM_FIELDS): Promise<CarState> {
  if (DEMO) {
    // The same steps as below, from the generated car instead of the database.
    const { snapshot } = demoData();
    const stream = demoStream(fields, scenario);
    return { latest: snapshot, lastOnline: applyStream(snapshot, stream), streamAt: newestReading(stream), flags: demoCarFlags() };
  }
  const [latest, lastOnline, stream] = await Promise.all([
    db().from("snapshots").select(SNAPSHOT_COLUMNS).eq("vehicle_id", vehicle.id).order("polled_at", { ascending: false }).limit(1).maybeSingle(),
    // The flags come from the same row: the poll keeps Tesla's response on every online check.
    db()
      .from("snapshots")
      .select(`${SNAPSHOT_COLUMNS}, ${FLAG_COLUMNS}`)
      .eq("vehicle_id", vehicle.id)
      .eq("state", "online")
      .order("polled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    vehicle.vin ? loadStream(vehicle.vin, fields) : {},
  ]);
  const error = latest.error ?? lastOnline.error;
  if (error) throw new Error(error.message);
  // A select built from a string has no row type.
  const online = lastOnline.data as unknown as Record<string, unknown> | null;
  const snapshot = online && (Object.fromEntries(Object.entries(online).filter(([key]) => !FLAG_KEYS.includes(key))) as Snapshot);
  return { latest: latest.data as Snapshot | null, lastOnline: applyStream(snapshot, stream), streamAt: newestReading(stream), flags: carFlagsFrom(online) };
}

// The car's version history, newest first, without timings (see withTimelines).
export async function loadHistory(vehicle: Vehicle): Promise<VersionChange[]> {
  if (DEMO) return demoData().history;
  const { data, error } = await db()
    .from("version_history")
    .select("version, previous_version, detected_at, available_at, odometer_km")
    .eq("vehicle_id", vehicle.id)
    .order("detected_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionChange[];
}

// The versions a page can show notes for: each car's history and pending update.
export function versionsOnScreen(cars: { history: VersionChange[]; lastOnline: Snapshot | null }[]): string[] {
  const versions = new Set<string>();
  for (const car of cars) {
    car.history.forEach((h) => versions.add(h.version));
    if (car.lastOnline?.update_version) versions.add(car.lastOnline.update_version);
  }
  return [...versions];
}

// Notes for these versions, in one query. Missing table or no notes yet just means no notes are shown.
export async function loadReleaseNotes(versions: string[]): Promise<ReleaseNotesByVersion> {
  if (versions.length === 0) return {};
  if (DEMO) return Object.fromEntries(Object.entries(demoData().notes).filter(([version]) => versions.includes(version)));
  const { data, error } = await db().from("release_notes").select("version, notes, raw").in("version", versions);
  if (error) {
    console.warn("Release notes unavailable:", error.message);
    return {};
  }
  // Re-parse the stored response so rows saved before a parser fix show the cleaned notes too.
  return Object.fromEntries(
    (data as { version: string; notes: ReleaseNote[]; raw: unknown }[]).map((r) => [r.version, r.raw ? parseReleaseNotes(r.raw) : r.notes]),
  );
}

// The owner's cars and the latest poll run, or why there are none to show. Throws on a read error.
export async function loadOwnerCars(): Promise<OwnerGate | { kind: "ready"; vehicles: Vehicle[]; lastRun: PollRun | null }> {
  if (DEMO) {
    const { vehicle, lastRun } = demoData();
    return { kind: "ready", vehicles: [vehicle], lastRun };
  }
  const missing = missingEnv();
  if (missing.length) return { kind: "misconfigured", missing };
  const [connected, savedAt, vehicles, runs] = await Promise.all([
    isConnected(),
    tokensSavedAt(),
    db().from("vehicles").select("id:id::text, vin, display_name, last_state, current_version, last_seen_at, last_polled_at, model, exterior_color").order("created_at"),
    db().from("poll_runs").select("started_at, finished_at, ok, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!connected) return { kind: "disconnected" };
  if (vehicles.error) throw new Error(vehicles.error.message);
  if (runs.error) throw new Error(runs.error.message);
  // A sign-in since a run that failed on the tokens means its "sign in again" no longer applies.
  const run = runs.data as (PollRun & { finished_at: string | null }) | null;
  return { kind: "ready", vehicles: vehicles.data as Vehicle[], lastRun: run && withoutStaleTokenError(run, savedAt) };
}
