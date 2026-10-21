import "server-only";
import { parseReleaseNotes, type ReleaseNote, type ReleaseNotesByVersion } from "@/lib/release-notes";
import { type Reading, type UpdateTimeline, updateTimeline } from "@/lib/telemetry-derive";
import { missingEnv } from "./env";
import { db } from "./supabase";
import { applyStream, loadReadings, loadStream } from "./telemetry";
import { isConnected } from "./tesla";

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

export type VehicleView = {
  vehicle: Vehicle;
  latest: Snapshot | null;
  // Most recent snapshot taken while the car was online: the last known update status.
  lastOnline: Snapshot | null;
  history: VersionChange[];
};

export type Dashboard =
  | { kind: "misconfigured"; missing: string[] }
  | { kind: "error"; message: string }
  | { kind: "disconnected" }
  | { kind: "ready"; vehicles: VehicleView[]; lastRun: PollRun | null; releaseNotes: ReleaseNotesByVersion };

const SNAPSHOT_COLUMNS =
  "polled_at, state, car_version, update_status, update_version, download_perc, install_perc, expected_duration_sec, scheduled_time_ms, battery_level, battery_range_km, charging_state, charge_limit, error";

const DAY_MS = 86_400_000;

// Download and install durations for the versions in history, from the streamed update fields. These only
// change during an update, so one query per field from the oldest version on screen stays small. Anything
// that can't be read just leaves the rows without timings.
async function withTimelines(vin: string, history: VersionChange[]): Promise<VersionChange[]> {
  if (history.length === 0) return history;
  const from = new Date(Date.parse(history[history.length - 1].detected_at) - 14 * DAY_MS).toISOString();
  const [pending, download, install, installed] = await Promise.all([
    loadReadings(vin, "SoftwareUpdateVersion", from),
    loadReadings(vin, "SoftwareUpdateDownloadPercentComplete", from),
    loadReadings(vin, "SoftwareUpdateInstallationPercentComplete", from),
    loadReadings(vin, "Version", from),
  ]);
  if (!pending || !download || !install || !installed) return history;
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
    });
    return timeline ? { ...change, timeline } : change;
  });
}

async function vehicleView(vehicle: Vehicle): Promise<VehicleView> {
  const [latest, lastOnline, history, stream] = await Promise.all([
    db().from("snapshots").select(SNAPSHOT_COLUMNS).eq("vehicle_id", vehicle.id).order("polled_at", { ascending: false }).limit(1).maybeSingle(),
    db()
      .from("snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("vehicle_id", vehicle.id)
      .eq("state", "online")
      .order("polled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("version_history")
      .select("version, previous_version, detected_at, available_at, odometer_km")
      .eq("vehicle_id", vehicle.id)
      .order("detected_at", { ascending: false })
      .limit(100),
    vehicle.vin ? loadStream(vehicle.vin) : {},
  ]);
  const error = latest.error ?? lastOnline.error ?? history.error;
  if (error) throw new Error(error.message);
  return {
    vehicle,
    latest: latest.data as Snapshot | null,
    lastOnline: applyStream(lastOnline.data as Snapshot | null, stream),
    history: vehicle.vin ? await withTimelines(vehicle.vin, (history.data ?? []) as VersionChange[]) : ((history.data ?? []) as VersionChange[]),
  };
}

// Notes for every version on screen (history + pending updates), in one query. Missing table or
// no notes yet just means no notes are shown.
async function loadReleaseNotes(views: VehicleView[]): Promise<ReleaseNotesByVersion> {
  const versions = new Set<string>();
  for (const v of views) {
    v.history.forEach((h) => versions.add(h.version));
    if (v.lastOnline?.update_version) versions.add(v.lastOnline.update_version);
  }
  if (versions.size === 0) return {};
  const { data, error } = await db().from("release_notes").select("version, notes, raw").in("version", [...versions]);
  if (error) {
    console.warn("Release notes unavailable:", error.message);
    return {};
  }
  // Re-parse the stored response so rows saved before a parser fix show the cleaned notes too.
  return Object.fromEntries(
    (data as { version: string; notes: ReleaseNote[]; raw: unknown }[]).map((r) => [r.version, r.raw ? parseReleaseNotes(r.raw) : r.notes]),
  );
}

export async function loadDashboard(): Promise<Dashboard> {
  const missing = missingEnv();
  if (missing.length) return { kind: "misconfigured", missing };

  try {
    const [connected, vehicles, runs] = await Promise.all([
      isConnected(),
      db().from("vehicles").select("id:id::text, vin, display_name, last_state, current_version, last_seen_at, last_polled_at, model, exterior_color").order("created_at"),
      db().from("poll_runs").select("started_at, ok, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!connected) return { kind: "disconnected" };
    if (vehicles.error) throw new Error(vehicles.error.message);
    if (runs.error) throw new Error(runs.error.message);
    const views = await Promise.all((vehicles.data as Vehicle[]).map(vehicleView));
    return {
      kind: "ready",
      vehicles: views,
      lastRun: runs.data as PollRun | null,
      releaseNotes: await loadReleaseNotes(views),
    };
  } catch (err) {
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
