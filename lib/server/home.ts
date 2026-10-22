import "server-only";
import { DEMO, type DemoScenario } from "@/lib/demo";
import type { ChargingRates } from "@/lib/charging-rates";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type ChargingSession, loadChargingSessions } from "./charging";
import { loadChargingRates } from "./charging-rates";
import { type CarState, loadCarState, loadOwnerCars, type OwnerGate, type PollRun, type Vehicle } from "./dashboard";
import { demoFirstWeekStart } from "./demo";
import { loadDrivingFigures, loadWindowStats, type WindowStats } from "./driving";
import { loadStreamSessions, type StreamChargeSession } from "./stream-charging";

export type HomeCar = CarState & { vehicle: Vehicle };

type HomeData = {
  cars: HomeCar[];
  lastRun: PollRun | null;
  // Driving figures are the primary car's; charging covers every car, like the Charging page.
  figures: DrivingFigures;
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  rates: ChargingRates;
  // The primary car's last 90 days of streamed readings: drives, the battery trend, range and parked drain.
  window: WindowStats;
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
    const [cars, figures, sessions, streamSessions, rates, window] = await Promise.all([
      Promise.all(owner.vehicles.map(async (vehicle) => ({ vehicle, ...(await loadCarState(vehicle, scenario)) }))),
      loadDrivingFigures(primary?.vin ?? null, now, demoSince),
      loadChargingSessions(),
      loadStreamSessions(),
      loadChargingRates(),
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
      rates,
      window: { ...window, driving: { ...window.driving, drives: window.driving.drives.filter((d) => demoSince === undefined || d.start >= demoSince) } },
    };
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}
