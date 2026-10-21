import "server-only";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { Dashboard, Snapshot, Vehicle, VehicleView, VersionChange } from "./dashboard";

export const DEMO_SCENARIOS = {
  full: "Two cars, long history",
  installing: "Installing",
  "wifi-wait": "Waiting for Wi-Fi",
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

// Demo data copies real Tesla data: shapes, units and value formats come from a real car's
// stored response (anonymised), version numbers from Tesla's published release list, and
// release notes word for word from the Fleet API. Only the timing between versions is simulated.

// Newest first, like the real query. Each entry: [version, days ago].
const LONG_HISTORY: [string, number][] = [
  ["2026.38.3.1", 6],
  ["2026.32.3", 44],
  ["2026.26.6", 80],
  ["2026.20.6.10", 118],
  ["2026.14.6.6", 160],
  ["2026.8.3", 205],
  ["2026.2.9", 250],
  ["2025.44.25.1", 300],
  ["2025.38.8.5", 340],
  ["2025.32.8.5", 385],
  ["2025.26.7.10", 430],
];

// The most-installed newer release on TeslaFi, for the pending-update scenarios.
const NEXT_VERSION = "2026.38.5.1";

// Release notes exactly as the Fleet API returned them (after parseReleaseNotes).
const DEMO_NOTES: ReleaseNotesByVersion = {
  "2026.38.3.1": [
    {
      title: "Halloween Mode",
      description:
        "Spread holiday fear year round with Halloween Mode. Put a Ghost Costume on your car visualization. Turn on Trick or Treat Mode to play spooky sounds and flicker the lights when visitors approach. Schedule a haunting light show, and turn your car into a chilling Photobooth!",
    },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
  "2026.32.3": [
    { title: "Wheel Selection", description: "Choose from new wheel options to customize the appearance of your Tesla." },
    {
      title: "Apple Music",
      description: "Go to Search, select Apple Music, then tap Library to find the songs, albums, and playlists you've added",
    },
    { title: "Security Improvements", description: "This update includes important security fixes and improvements." },
  ],
};

export function isDemoScenario(value: unknown): value is DemoScenario {
  return typeof value === "string" && Object.hasOwn(DEMO_SCENARIOS, value);
}

export function demoDashboard(scenario: DemoScenario = "full"): Dashboard {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  // Available 1–3 days before install; about 38 km a day of driving.
  const history = (rows: [string, number][]): VersionChange[] =>
    rows.map(([version, days], i) => {
      const previous = rows[i + 1]?.[0] ?? null;
      return {
        version,
        previous_version: previous,
        detected_at: ago(days),
        available_at: previous ? ago(days + 1 + (i % 3)) : null,
        odometer_km: Math.round(24310 - days * 38),
      };
    });

  const snapshot = (overrides: Partial<Snapshot>): Snapshot => ({
    polled_at: ago(0.1),
    state: "online",
    // A real idle snapshot: Tesla reports 0% / 1% and a 45 min estimate even with no update pending.
    car_version: "2026.38.3.1",
    update_status: null,
    update_version: null,
    download_perc: 0,
    install_perc: 1,
    expected_duration_sec: 2700,
    scheduled_time_ms: null,
    battery_level: 61,
    battery_range_km: 266.1,
    charging_state: "Disconnected",
    charge_limit: 65,
    error: null,
    ...overrides,
  });

  const car = (vehicle: Partial<Vehicle>, latest: Snapshot | null, lastOnline: Snapshot | null, rows: [string, number][]): VehicleView => ({
    vehicle: {
      id: 1,
      vin: "LRWYGCEK3SC100001",
      display_name: "Phantom",
      model: "Model Y",
      exterior_color: "Diamond Black",
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
    releaseNotes: DEMO_NOTES,
    lastRun: { started_at: ago(0.1), ok: !failed, error: failed ? REGION_ERROR : null },
  });

  const one = (overrides: Partial<Snapshot>) => {
    const s = snapshot(overrides);
    return ready([car({}, s, s, LONG_HISTORY.slice(0, 5))]);
  };

  switch (scenario) {
    case "installing":
      return one({ update_status: "installing", update_version: NEXT_VERSION, install_perc: 63, expected_duration_sec: 1500 });
    case "wifi-wait":
      return one({ update_status: "downloading_wifi_wait", update_version: NEXT_VERSION, download_perc: 0, expected_duration_sec: 2400 });
    case "scheduled":
      return one({ update_status: "scheduled", update_version: NEXT_VERSION, scheduled_time_ms: now + 0.6 * DAY });
    case "available":
      return one({ update_status: "available", update_version: NEXT_VERSION, expected_duration_sec: 2400 });
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
      const downloading = snapshot({ update_status: "downloading", update_version: NEXT_VERSION, download_perc: 42, expected_duration_sec: 2400 });
      const secondOnline = snapshot({
        polled_at: ago(2.4),
        car_version: "2026.32.3",
        update_status: "available",
        update_version: "2026.38.3.1",
        battery_level: 48,
        battery_range_km: 209.8,
        charging_state: "Charging",
        charge_limit: 80,
      });
      return ready([
        car({}, downloading, downloading, LONG_HISTORY),
        car(
          { id: 2, vin: "LRWYGCEK1SC200002", display_name: "Nova", model: "Model Y", exterior_color: "Stealth Grey", last_state: "asleep" },
          snapshot({ state: "asleep", car_version: null }),
          secondOnline,
          LONG_HISTORY.slice(1, 6),
        ),
      ]);
    }
  }
}
