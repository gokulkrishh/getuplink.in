import "server-only";
import { DEMO, type DemoScenario } from "@/lib/demo";
import type { DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import type { Timeframe } from "@/lib/periods";
import { type ChargingSession, loadChargingSessions } from "./charging";
import { type CarState, loadCarState, loadOwnerCars, type OwnerGate, type PollRun, type Vehicle } from "./dashboard";
import { demoFirstWeekStart } from "./demo";
import { loadDrivingFigures, loadTimeframeDriving, loadWindowStats, type WindowStats } from "./driving";
import { invoicesBySession } from "./receipts";
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
};

export type Home = OwnerGate | ({ kind: "ready" } & HomeData);

// Everything the home page shows: each car's state now, and the period figures. It only reads, so nothing
// here wakes the car.
export async function loadHome(scenario: DemoScenario, now: number): Promise<Home> {
  try {
    const owner = await loadOwnerCars();
    if (owner.kind !== "ready") return owner;
    // The primary car, as loadPrimaryVehicle picks it: the first with a VIN.
    const primary = owner.vehicles.find((v) => v.vin) ?? null;
    // The demo's First week: a car connected four days ago, so nothing before then exists.
    const demoSince = DEMO && scenario === "firstWeek" ? demoFirstWeekStart() : undefined;
    const [cars, figures, sessions, [streamSessions, invoices], window] = await Promise.all([
      Promise.all(
        owner.vehicles.map(async (vehicle) => {
          // The flags come with the state's read of the last online check.
          const { flags, ...state } = await loadCarState(vehicle, scenario);
          return { vehicle, ...state, notices: flags.notices };
        }),
      ),
      loadDrivingFigures(primary?.vin ?? null, now, demoSince),
      loadChargingSessions(),
      // The invoices only need the session ids, so they load while the 90-day window still does.
      loadStreamSessions().then(async (list) => [list, await invoicesBySession(list.filter((s) => !s.supercharger).map((s) => s.id))] as const),
      loadWindowStats(primary?.vin ?? null, now),
    ]);
    const after = (s: { started_at: string }) => demoSince === undefined || Date.parse(s.started_at) >= demoSince;
    return {
      kind: "ready",
      cars,
      lastRun: owner.lastRun,
      figures,
      sessions: sessions.filter(after),
      streamSessions: streamSessions.filter(after),
      window: { ...window, driving: { ...window.driving, drives: window.driving.drives.filter((d) => demoSince === undefined || d.start >= demoSince) } },
      invoices,
    };
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}

// The primary car's driving figures for a range picked by date (see loadTimeframeDriving); null when the
// counters can't be read.
export async function loadRangeDriving(scenario: DemoScenario, vin: string | null, frame: Timeframe, now: number): Promise<DrivingPeriod | null> {
  try {
    return await loadTimeframeDriving(vin, frame, now, DEMO && scenario === "firstWeek" ? demoFirstWeekStart() : undefined);
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return null;
  }
}
