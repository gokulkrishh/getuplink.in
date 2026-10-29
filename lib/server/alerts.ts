import "server-only";
import { type Alert, buildAlerts } from "@/lib/alerts";
import { DEMO } from "@/lib/demo";
import { messageOf } from "@/lib/errors";
import { loadOwnerCars } from "./dashboard";
import type { Owner } from "./data/owner";
import { carSetups, SetupSchemaMissing } from "./data/setup";
import { latestHealth } from "./data/system";

// The header bell's alerts for this owner (see lib/alerts.ts), from what's stored: the cars' key answers
// (kept by /setup and the health check), the latest check, whether Tesla is connected, and for the admin
// each part's latest health check. Never asks Tesla, never throws: a read that fails leaves its alerts out.
export async function loadAlerts(owner: Owner, admin: boolean): Promise<Alert[]> {
  if (DEMO) return [];
  const quiet = <T,>(what: string, fallback: T) => (err: unknown): T => {
    if (!(err instanceof SetupSchemaMissing)) console.warn(`Alerts: reading ${what} failed:`, messageOf(err));
    return fallback;
  };
  const [cars, account, health] = await Promise.all([
    carSetups(owner).catch(quiet("cars", [])),
    loadOwnerCars(owner).catch(quiet("the latest check", null)),
    admin ? latestHealth().catch(quiet("health", [])) : [],
  ]);
  return buildAlerts({
    connected: account?.kind !== "disconnected",
    cars: cars.map((c) => ({ vin: c.vin, name: c.name, keyPaired: c.keyPaired })),
    lastRun: account?.kind === "ready" ? account.lastRun : null,
    health,
  });
}
