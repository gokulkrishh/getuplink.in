import "server-only";
import { DEMO, type DemoScenario } from "@/lib/demo";
import type { DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import type { Timeframe } from "@/lib/periods";
import { type ChargingSession, loadChargingSessions } from "./charging";
import type { Owner } from "./data/owner";
import { type CarState, loadCarState, loadOwnerCars, type OwnerGate, type PollRun, type Vehicle } from "./dashboard";
import { demoFirstWeekStart } from "./demo";
import { loadDrivingFigures, loadTimeframeDriving, loadWindowStats, type WindowStats } from "./driving";
import { invoicesBySession } from "./receipts";
import type { SpotName } from "@/lib/charge-names";
import { loadChargeSpots } from "./charging-extra";
import { loadStreamSessions, type StreamChargeSession } from "./stream-charging";

// notices: what Tesla flagged at the car's latest online check (see loadCarFlags).
export type HomeCar = Omit<CarState, "flags"> & { vehicle: Vehicle; notices: string[] };

type HomeData = {
  cars: HomeCar[];
  lastRun: PollRun | null;
  // Driving figures are the primary car's; charging covers every car, like the Charging page.
  figures: DrivingFigures;
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  // The primary car's last 90 days of streamed readings: drives, the battery trend, range and parked drain.
  window: WindowStats;
  // Third-party invoices attached through the connector, by streamed session id.
  invoices: Awaited<ReturnType<typeof invoicesBySession>>;
  // The latest charges' names from where they happened, by streamed session id (see loadChargeSpots).
  spots: Record<number, SpotName>;
};

// The home list shows three charges a period; the latest few cover them.
const NAMED_CHARGES = 6;

export type Home = OwnerGate | ({ kind: "ready" } & HomeData);

// Everything the home page shows: each car's state now, and the period figures. It only reads, so nothing
// here wakes the car.
export async function loadHome(owner: Owner, scenario: DemoScenario, now: number): Promise<Home> {
  try {
    const account = await loadOwnerCars(owner);
    if (account.kind !== "ready") return account;
    // The primary car, as loadPrimaryVehicle picks it: the first with a VIN.
    const primary = account.vehicles.find((v) => v.vin) ?? null;
    // The demo's First week: a car connected four days ago, so nothing before then exists.
    const demoSince = DEMO && scenario === "firstWeek" ? demoFirstWeekStart() : undefined;
    const [cars, figures, sessions, [streamSessions, invoices], window] = await Promise.all([
      Promise.all(
        account.vehicles.map(async (vehicle) => {
          // The flags come with the state's read of the last online check.
          const { flags, ...state } = await loadCarState(owner, vehicle, scenario);
          return { vehicle, ...state, notices: flags.notices };
        }),
      ),
      loadDrivingFigures(owner, primary?.vin ?? null, now, demoSince),
      loadChargingSessions(owner),
      // The invoices only need the session ids, so they load while the 90-day window still does.
      loadStreamSessions(owner).then(async (list) => [list, await invoicesBySession(owner, list.filter((s) => !s.supercharger).map((s) => s.id))] as const),
      loadWindowStats(owner, primary?.vin ?? null, now),
    ]);
    const after = (s: { started_at: string }) => demoSince === undefined || Date.parse(s.started_at) >= demoSince;
    const shownStream = streamSessions.filter(after);
    // The header's state wins: a car it shows charging isn't "parked now", even before the stations job has
    // built its session from the readings (every 15 minutes).
    const charging = cars.find((c) => c.vehicle.id === primary?.id)?.lastOnline?.charging_state === "Charging";
    const driving = charging ? { ...window.driving, parkedNow: null } : window.driving;
    // Names for the latest charges' spots, which the home list shows a few of (the owner's tag first).
    const spots = await loadChargeSpots(owner, primary?.vin ?? null, shownStream.slice(0, NAMED_CHARGES), { tesla: sessions, invoices, now }).catch(() => ({}));
    return {
      kind: "ready",
      cars,
      lastRun: account.lastRun,
      figures,
      sessions: sessions.filter(after),
      streamSessions: shownStream,
      window: { ...window, driving: { ...driving, drives: driving.drives.filter((d) => demoSince === undefined || d.start >= demoSince) } },
      invoices,
      spots,
    };
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}

// The primary car's driving figures for a range picked by date (see loadTimeframeDriving); null when the
// counters can't be read.
export async function loadRangeDriving(owner: Owner, scenario: DemoScenario, vin: string | null, frame: Timeframe, now: number): Promise<DrivingPeriod | null> {
  try {
    return await loadTimeframeDriving(owner, vin, frame, now, DEMO && scenario === "firstWeek" ? demoFirstWeekStart() : undefined);
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return null;
  }
}
