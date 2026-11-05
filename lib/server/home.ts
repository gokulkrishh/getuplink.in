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
import { carLastReadingAt, primaryCar } from "./telemetry";

// notices: what Tesla flagged at the car's latest online check (see loadCarFlags).
export type HomeCar = Omit<CarState, "flags"> & { vehicle: Vehicle; notices: string[] };

// What the car strip needs, quick to read: each car's state, the primary car's figures (its odometer, and
// `since` for the share card) and when it last sent data.
type HomeNowData = {
  cars: HomeCar[];
  lastRun: PollRun | null;
  // Driving figures are the primary car's.
  figures: DrivingFigures;
  // When the primary car last sent data, null for never, undefined when the read failed (see hasNoHistory).
  lastReadingAt: string | null | undefined;
};

// What the week's totals and charts need, the slow part. Charging covers every car, like the Charging page.
type HomeWeekData = {
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

export type HomeNow = OwnerGate | ({ kind: "ready" } & HomeNowData);
// Null when there are no cars to show (the strip's part says why).
export type HomeWeek = { kind: "error"; message: string } | ({ kind: "ready" } & HomeWeekData) | null;

// The demo's First week: a car connected four days ago, so nothing before then exists.
const demoSinceOf = (scenario: DemoScenario) => (DEMO && scenario === "firstWeek" ? demoFirstWeekStart() : undefined);

// What the home page shows first: each car's state now and the primary car's figures. It only reads, so
// nothing here wakes the car. The week's part (loadHomeWeek) loads beside it, so the strip never waits on it.
export async function loadHomeNow(owner: Owner, scenario: DemoScenario, now: number): Promise<HomeNow> {
  try {
    const account = await loadOwnerCars(owner);
    if (account.kind !== "ready") return account;
    const primary = primaryCar(account.vehicles);
    const [cars, figures, lastReadingAt] = await Promise.all([
      Promise.all(
        account.vehicles.map(async (vehicle) => {
          // The flags come with the state's read of the last online check.
          const { flags, ...state } = await loadCarState(owner, vehicle, scenario, now);
          return { vehicle, ...state, notices: flags.notices };
        }),
      ),
      loadDrivingFigures(owner, primary?.vin ?? null, now, demoSinceOf(scenario)),
      primary?.vin ? carLastReadingAt(owner, primary.vin).catch(() => undefined) : null,
    ]);
    return { kind: "ready", cars, lastRun: account.lastRun, figures, lastReadingAt };
  } catch (err) {
    if (DEMO) throw err;
    console.error(err);
    return { kind: "error", message: (err as Error).message };
  }
}

// The week's part of the home page: the charges, and the primary car's 90-day window (the slowest read).
// The car's state isn't read here: a car the strip shows charging is told apart where both meet (app/page.tsx).
export async function loadHomeWeek(owner: Owner, scenario: DemoScenario, now: number): Promise<HomeWeek> {
  try {
    const account = await loadOwnerCars(owner);
    if (account.kind !== "ready") return null;
    const vin = primaryCar(account.vehicles)?.vin ?? null;
    const demoSince = demoSinceOf(scenario);
    const after = (s: { started_at: string }) => demoSince === undefined || Date.parse(s.started_at) >= demoSince;
    const tesla = loadChargingSessions(owner);
    // The invoices only need the session ids, so they load while the 90-day window still does.
    const stream = loadStreamSessions(owner).then(async (list) => [list, await invoicesBySession(owner, list.filter((s) => !s.supercharger).map((s) => s.id))] as const);
    // Names for the latest charges' spots, which the home list shows a few of (the owner's tag first). They
    // need the charges only, so they don't wait for the window either.
    const named = Promise.all([tesla, stream]).then(([sessions, [list, invoices]]) =>
      loadChargeSpots(owner, vin, list.filter(after).slice(0, NAMED_CHARGES), { tesla: sessions, invoices, now }).catch(() => ({})),
    );
    const [sessions, [streamSessions, invoices], window, spots] = await Promise.all([tesla, stream, loadWindowStats(owner, vin, now), named]);
    return {
      kind: "ready",
      sessions: sessions.filter(after),
      streamSessions: streamSessions.filter(after),
      window: { ...window, driving: { ...window.driving, drives: window.driving.drives.filter((d) => demoSince === undefined || d.start >= demoSince) } },
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
