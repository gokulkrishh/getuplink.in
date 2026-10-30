import "server-only";
import { type Alert, type AlertCar, buildAlerts } from "@/lib/alerts";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { loadCarFlags } from "./car-flags";
import { loadOwnerCars } from "./dashboard";
import { demoData } from "./demo";
import type { Owner } from "./data/owner";
import { carSetups, configExpiries, SetupSchemaMissing } from "./data/setup";
import { latestHealth } from "./data/system";
import { carLastReadingAt } from "./telemetry";
import { whatsNewBell } from "./whats-new";

const DAY_MS = 86_400_000;

// The header bell's alerts for this owner (see lib/alerts.ts), from what's stored: the cars' key, streaming
// and config expiry answers (kept by /setup and the health check), each car's newest data and the flags at
// its latest online check, the latest check, whether Tesla is connected, and for the admin each part's
// latest health check. Never asks Tesla, never throws: a read that fails leaves its alerts out.
export async function loadAlerts(owner: Owner, admin: boolean): Promise<Alert[]> {
  if (DEMO) return demoAlerts();
  const now = Date.now();
  const quiet = <T,>(what: string, fallback: T) => (err: unknown): T => {
    if (!(err instanceof SetupSchemaMissing)) console.warn(`Alerts: reading ${what} failed:`, messageOf(err));
    return fallback;
  };
  const [setups, account, health, expiries] = await Promise.all([
    carSetups(owner).catch(quiet("cars", [])),
    loadOwnerCars(owner).catch(quiet("the latest check", null)),
    admin ? latestHealth().catch(quiet("health", [])) : [],
    // Missing before 20261113120000_config_expiry.sql: no expiry warnings, nothing else changes.
    configExpiries(owner).catch(quiet("config expiry", new Map<string, string>())),
  ]);
  const vehicles = account?.kind === "ready" ? account.vehicles : [];
  const cars = await Promise.all(
    setups.map(async (car): Promise<AlertCar> => {
      const vehicle = vehicles.find((v) => v.vin === car.vin);
      // A car's newest data matters only once Tesla has said the key is on (see quietDays).
      const [lastReadingAt, flags] = await Promise.all([
        car.keyPaired === true && vehicle?.last_seen_at ? carLastReadingAt(owner, car.vin).catch(quiet("a car's newest data", null)) : null,
        vehicle ? loadCarFlags(owner, vehicle.id).catch(quiet("a car's flags", null)) : null,
      ]);
      return {
        ...car,
        configExpiresAt: expiries.get(car.vin) ?? null,
        lastReadingAt,
        seenAwakeAt: vehicle?.last_seen_at ?? null,
        ...flags?.seen,
      };
    }),
  );
  const news = await whatsNewBell(owner, admin);
  return [...buildAlerts({
    now,
    connected: account?.kind !== "disconnected",
    cars,
    lastRun: account?.kind === "ready" ? account.lastRun : null,
    health,
  }), ...news];
}

// Demo mode has no account to check, so the bell shows a sample of each kind: the demo car's access
// running out with a renewal it hasn't taken (needs you) and a service visit (good to know). Bell only: the demo's home page keeps its
// car without notices.
export function demoAlerts(): Alert[] {
  const { vehicle, vin, now } = demoData();
  const car: AlertCar = {
    vin,
    name: vehicle.display_name,
    keyPaired: true,
    keyCheckedAt: null,
    streaming: "synced",
    streamingCheckedAt: null,
    configExpiresAt: new Date(now + 12 * DAY_MS + 3_600_000).toISOString(),
    // A renewal sent two days ago that the car hasn't taken.
    configSentAt: new Date(now - 2 * DAY_MS).toISOString(),
    inService: true,
  };
  return buildAlerts({ now, connected: true, cars: [car], lastRun: null, health: [] });
}
