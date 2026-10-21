import "server-only";
import { missingEnv } from "./env";
import { db } from "./supabase";
import { isConnected } from "./tesla";

export type Vehicle = {
  id: number;
  vin: string | null;
  display_name: string | null;
  last_state: string | null;
  current_version: string | null;
  last_seen_at: string | null;
  last_polled_at: string | null;
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
  error: string | null;
};

export type VersionChange = {
  version: string;
  previous_version: string | null;
  detected_at: string;
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
  | { kind: "ready"; vehicles: VehicleView[]; lastRun: PollRun | null };

const SNAPSHOT_COLUMNS =
  "polled_at, state, car_version, update_status, update_version, download_perc, install_perc, expected_duration_sec, scheduled_time_ms, error";

async function vehicleView(vehicle: Vehicle): Promise<VehicleView> {
  const [latest, lastOnline, history] = await Promise.all([
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
      .select("version, previous_version, detected_at")
      .eq("vehicle_id", vehicle.id)
      .order("detected_at", { ascending: false })
      .limit(100),
  ]);
  const error = latest.error ?? lastOnline.error ?? history.error;
  if (error) throw new Error(error.message);
  return {
    vehicle,
    latest: latest.data as Snapshot | null,
    lastOnline: lastOnline.data as Snapshot | null,
    history: (history.data ?? []) as VersionChange[],
  };
}

export async function loadDashboard(): Promise<Dashboard> {
  const missing = missingEnv();
  if (missing.length) return { kind: "misconfigured", missing };

  try {
    if (!(await isConnected())) return { kind: "disconnected" };
    const [vehicles, runs] = await Promise.all([
      db().from("vehicles").select("id, vin, display_name, last_state, current_version, last_seen_at, last_polled_at").order("created_at"),
      db().from("poll_runs").select("started_at, ok, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (vehicles.error) throw new Error(vehicles.error.message);
    if (runs.error) throw new Error(runs.error.message);
    return {
      kind: "ready",
      vehicles: await Promise.all((vehicles.data as Vehicle[]).map(vehicleView)),
      lastRun: runs.data as PollRun | null,
    };
  } catch (err) {
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
