import "server-only";
import type { Dashboard, Snapshot, Vehicle, VehicleView, VersionChange } from "./dashboard";

export const DEMO_SCENARIOS = {
  full: "Two cars, long history",
  installing: "Installing",
  scheduled: "Scheduled",
  available: "Update available",
  uptodate: "Up to date",
  "never-seen": "Asleep, never seen",
  "no-vehicles": "No vehicles",
  "check-failed": "Check failed",
  disconnected: "Not connected",
  misconfigured: "Misconfigured",
} as const;

export type DemoScenario = keyof typeof DEMO_SCENARIOS;

const DAY = 24 * 60 * 60 * 1000;
const REGION_ERROR =
  'GET /api/1/vehicles failed (412): {"error":"Account must be registered in the current region https://fleet-api.prd.na.vn.cloud.tesla.com"}';

// Newest first, like the real query. Each entry: [version, days ago].
const LONG_HISTORY: [string, number][] = [
  ["2026.38.4", 9],
  ["2026.32.6", 41],
  ["2026.32.3", 52],
  ["2026.26.3", 83],
  ["2026.20.5", 121],
  ["2026.14.8", 168],
  ["2026.8.3", 214],
  ["2026.2.9", 262],
  ["2025.44.25", 301],
  ["2025.38.8", 349],
  ["2025.32.6", 398],
  ["2025.26.7", 452],
];

export function isDemoScenario(value: unknown): value is DemoScenario {
  return typeof value === "string" && value in DEMO_SCENARIOS;
}

export function demoDashboard(scenario: DemoScenario = "full"): Dashboard {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  const history = (rows: [string, number][]): VersionChange[] =>
    rows.map(([version, days], i) => ({ version, previous_version: rows[i + 1]?.[0] ?? null, detected_at: ago(days) }));

  const snapshot = (overrides: Partial<Snapshot>): Snapshot => ({
    polled_at: ago(0.1),
    state: "online",
    car_version: "2026.38.4 3f2a1c9b",
    update_status: null,
    update_version: null,
    download_perc: null,
    install_perc: null,
    expected_duration_sec: null,
    scheduled_time_ms: null,
    error: null,
    ...overrides,
  });

  const car = (vehicle: Partial<Vehicle>, latest: Snapshot | null, lastOnline: Snapshot | null, rows: [string, number][]): VehicleView => ({
    vehicle: {
      id: 1,
      vin: "DEMO00000000000001",
      display_name: "Model Y",
      last_state: latest?.state ?? "asleep",
      current_version: rows[0]?.[0] ?? null,
      last_seen_at: lastOnline?.polled_at ?? null,
      last_polled_at: ago(0.1),
      ...vehicle,
    },
    latest,
    lastOnline,
    history: history(rows),
  });

  const ready = (vehicles: VehicleView[], failed = false): Dashboard => ({
    kind: "ready",
    vehicles,
    lastRun: { started_at: ago(0.1), ok: !failed, error: failed ? REGION_ERROR : null },
  });

  const one = (overrides: Partial<Snapshot>) => {
    const s = snapshot(overrides);
    return ready([car({}, s, s, LONG_HISTORY.slice(0, 5))]);
  };

  switch (scenario) {
    case "installing":
      return one({ update_status: "installing", update_version: "2026.38.6", install_perc: 63, expected_duration_sec: 1500 });
    case "scheduled":
      return one({ update_status: "scheduled", update_version: "2026.38.6", scheduled_time_ms: now + 0.6 * DAY });
    case "available":
      return one({ update_status: "available", update_version: "2026.38.6", expected_duration_sec: 1800 });
    case "uptodate":
      return one({});
    case "never-seen":
      return ready([car({ last_state: "asleep" }, snapshot({ state: "asleep", car_version: null }), null, [])]);
    case "no-vehicles":
      return ready([]);
    case "check-failed": {
      const s = snapshot({});
      return ready([car({ last_polled_at: ago(0.4) }, s, s, LONG_HISTORY.slice(0, 4))], true);
    }
    case "disconnected":
      return { kind: "disconnected" };
    case "misconfigured":
      return { kind: "misconfigured", missing: ["TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"] };
    case "full": {
      const downloading = snapshot({ update_status: "downloading", update_version: "2026.38.6", download_perc: 42, expected_duration_sec: 1800 });
      const model3Online = snapshot({
        polled_at: ago(2.4),
        car_version: "2026.32.6 9c1d2e3f",
        update_status: "available",
        update_version: "2026.38.4",
      });
      return ready([
        car({}, downloading, downloading, LONG_HISTORY),
        car(
          { id: 2, vin: "DEMO00000000000002", display_name: "Model 3", last_state: "asleep" },
          snapshot({ state: "asleep", car_version: null }),
          model3Online,
          LONG_HISTORY.slice(1, 6),
        ),
      ]);
    }
  }
}
