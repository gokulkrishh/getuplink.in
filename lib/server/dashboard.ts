import "server-only";
import { DEMO, type DemoScenario } from "@/lib/demo";
import { LIST_PREVIEW } from "@/lib/list";
import { parseReleaseNotes, type ReleaseNote, type ReleaseNotesByVersion } from "@/lib/release-notes";
import { sentryOn } from "@/lib/car-now";
import { type Stream, UPDATE_FIELDS } from "@/lib/telemetry";
import { type Reading, type UpdateTimeline, updateTimeline } from "@/lib/telemetry-derive";
import { carFlagsFrom, type CarFlagsNow, demoCarFlags, FLAG_COLUMNS, FLAG_KEYS } from "./car-flags";
import { demoData, demoStream } from "./demo";
import { missingEnv } from "./env";
import { type Owner, ownerDb } from "./data/owner";
import { releaseNotesFor } from "./data/system";
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
  // Set once the car has left the owner's Tesla account (see primaryCar).
  readings_until?: string | null;
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
  // Energy put into the battery so far in the running charge, in kWh, from Fleet Telemetry only (null from polls).
  charge_energy_kwh: number | null;
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
  // Sentry Mode is watching now (see sentryOn), when SentryMode is among the fields read.
  sentry: boolean;
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
export async function withTimelines(owner: Owner, vin: string, history: VersionChange[]): Promise<VersionChange[]> {
  if (history.length === 0) return history;
  const from = new Date(Date.parse(history[history.length - 1].detected_at) - 14 * DAY_MS).toISOString();
  const readings = await loadReadingsByField(owner, vin, TIMELINE_FIELDS, from, new Date().toISOString());
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

// See CarState. `fields` are the stream fields to read; streamAt only covers those. The update fields are
// always read too: the pending update laid over the check needs every one of them (see applyStream).
export async function loadCarState(owner: Owner, vehicle: Pick<Vehicle, "id" | "vin">, scenario: DemoScenario, wanted: string[] = STREAM_FIELDS): Promise<CarState> {
  const fields = [...new Set([...wanted, ...UPDATE_FIELDS])];
  if (DEMO) {
    // The same steps as below, from the generated car instead of the database.
    const { snapshot } = demoData();
    const stream = demoStream(fields, scenario);
    return { latest: snapshot, lastOnline: applyStream(snapshot, stream), streamAt: newestReading(stream), flags: demoCarFlags(), sentry: sentryOn(stream.SentryMode, snapshot) };
  }
  const [latest, lastOnline, stream] = await Promise.all([
    ownerDb(owner).from("snapshots").select(SNAPSHOT_COLUMNS).eq("vehicle_id", vehicle.id).order("polled_at", { ascending: false }).limit(1).maybeSingle(),
    // The flags come from the same row: the poll keeps Tesla's response on every online check.
    ownerDb(owner)
      .from("snapshots")
      .select(`${SNAPSHOT_COLUMNS}, ${FLAG_COLUMNS}`)
      .eq("vehicle_id", vehicle.id)
      .eq("state", "online")
      .order("polled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    vehicle.vin ? loadStream(owner, vehicle.vin, fields) : {},
  ]);
  const error = latest.error ?? lastOnline.error;
  if (error) throw new Error(error.message);
  // A select built from a string has no row type.
  const online = lastOnline.data as unknown as Record<string, unknown> | null;
  const snapshot = online && (Object.fromEntries(Object.entries(online).filter(([key]) => !FLAG_KEYS.includes(key))) as Snapshot);
  const newest = latest.data as Snapshot | null;
  return { latest: newest, lastOnline: applyStream(snapshot, stream), streamAt: newestReading(stream), flags: carFlagsFrom(online), sentry: sentryOn((stream as Stream).SentryMode, newest) };
}

// The car's version history, newest first, without timings (see withTimelines).
export async function loadHistory(owner: Owner, vehicle: Vehicle): Promise<VersionChange[]> {
  if (DEMO) return demoData().history;
  const { data, error } = await ownerDb(owner)
    .from("version_history")
    .select("version, previous_version, detected_at, available_at, odometer_km")
    .eq("vehicle_id", vehicle.id)
    .order("detected_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionChange[];
}

// The versions a page shows notes for as it opens: each car's version and pending update, and its newest
// history rows (the rest come with their rows on Show more).
export function versionsOnScreen(cars: { version: string | null; history: VersionChange[]; lastOnline: Snapshot | null }[]): string[] {
  const versions = new Set<string>();
  for (const car of cars) {
    if (car.version) versions.add(car.version);
    car.history.slice(0, LIST_PREVIEW).forEach((h) => versions.add(h.version));
    if (car.lastOnline?.update_version) versions.add(car.lastOnline.update_version);
  }
  return [...versions];
}

// Notes for these versions, in one query. Missing table or no notes yet just means no notes are shown.
export async function loadReleaseNotes(versions: string[]): Promise<ReleaseNotesByVersion> {
  if (versions.length === 0) return {};
  if (DEMO) return Object.fromEntries(Object.entries(demoData().notes).filter(([version]) => versions.includes(version)));
  const { data, error } = await releaseNotesFor(versions);
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
export async function loadOwnerCars(owner: Owner): Promise<OwnerGate | { kind: "ready"; vehicles: Vehicle[]; lastRun: PollRun | null }> {
  if (DEMO) {
    const { vehicle, lastRun } = demoData();
    return { kind: "ready", vehicles: [vehicle], lastRun };
  }
  const missing = missingEnv();
  if (missing.length) return { kind: "misconfigured", missing };
  const [connected, savedAt, vehicles, runs] = await Promise.all([
    isConnected(owner),
    tokensSavedAt(owner),
    ownerDb(owner).from("vehicles").select("id:id::text, vin, display_name, last_state, current_version, last_seen_at, last_polled_at, model, exterior_color, readings_until").order("created_at"),
    ownerDb(owner).from("poll_runs").select("started_at, finished_at, ok, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!connected) return { kind: "disconnected" };
  if (vehicles.error) throw new Error(vehicles.error.message);
  if (runs.error) throw new Error(runs.error.message);
  // A sign-in since a run that failed on the tokens means its "sign in again" no longer applies.
  const run = runs.data as (PollRun & { finished_at: string | null }) | null;
  return { kind: "ready", vehicles: vehicles.data as Vehicle[], lastRun: run && withoutStaleTokenError(run, savedAt) };
}

// When the owner's latest check started, for Settings. Null before the first one.
export async function lastCheckAt(owner: Owner): Promise<string | null> {
  if (DEMO) return demoData().lastRun?.started_at ?? null;
  const { data } = await ownerDb(owner).from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.started_at as string | undefined) ?? null;
}
