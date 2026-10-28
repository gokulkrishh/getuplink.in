import "server-only";
import { DEMO, DEMO_SITE } from "@/lib/demo";
import { compareVersions } from "@/lib/rollout";
import { istDay, type Status } from "@/lib/status";
import { runErrorReason } from "@/lib/run-error";
import { normaliseVersion } from "@/lib/versions";
import { currentOwner } from "./auth";
import { demoData, demoFleet } from "./demo";
import { missingEnv } from "./env";
import { DEMO_OWNER, type Owner } from "./data/owner";
import { carsNotStreaming, type WaitingCar } from "./data/setup";
import { unknownCodes } from "@/lib/car";
import { ADMIN_ROLE, adminTotals, carCodes, userRole } from "./data/system";
import { canSendConfig } from "./telemetry-config";
import { COMPONENTS } from "./stream-health";

const DAY = 86_400_000;
export const RECENT_DAYS = 7;

// The admin is a role on the users row (users.role = 'admin', set by hand), never anything in code or env.
// Admin means a current session (currentOwner: signed, not revoked, approved) whose user has that role,
// read fresh from the database. Uncached: every admin action calls this again. In demo mode the demo
// owner is an admin.
export async function adminOwner(): Promise<Owner | null> {
  // The public demo site has no admin: no Admin, Waitlist or Costs in its menu, and those pages are a 404.
  // Local demo mode (UPLINK_DEMO=1) keeps them, to preview them while building.
  if (DEMO_SITE) return null;
  if (DEMO) return DEMO_OWNER;
  if (missingEnv().length) return null;
  const owner = await currentOwner();
  if (!owner) return null;
  return (await userRole(owner.userId)) === ADMIN_ROLE ? owner : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await adminOwner()) !== null;
}

export type AdminPage = {
  simulated: boolean; // demo mode: every figure comes from the simulated fleet
  owners: number;
  cars: number;
  // Cars online at a check in the last RECENT_DAYS days. Streaming doesn't update last_seen_at, so a car
  // that only streamed is not counted.
  onlineRecently: number;
  versions: { version: string; cars: number }[]; // newest first
  noVersion: number; // cars never seen online, so no version yet
  // The latest few failed checks: when, whose, and why in a few words (never the error text, which can quote a VIN).
  runs: { total: number; failed: number; failures: { at: string; userId: number | null; reason: string }[] };
  // Per component: its latest check, and the checks that found it not working in the last RECENT_DAYS days.
  health: ComponentHealthSummary[];
  // Cars that don't stream to Uplink yet (/setup's two steps), by user id: null before the car_setup
  // migration. sendsConfig: whether Uplink sends the streaming config itself (its keys are set).
  notStreaming: WaitingCar[] | null;
  sendsConfig: boolean;
  // Cars reporting a model or pack code lib/car.ts doesn't know yet, by user id; null when it couldn't be read.
  unknownCars: { userId: number; codes: string[] }[] | null;
};

function spread(versions: (string | null)[]): Pick<AdminPage, "versions" | "noVersion"> {
  const counts = new Map<string, number>();
  let noVersion = 0;
  for (const raw of versions) {
    const version = normaliseVersion(raw);
    if (version) counts.set(version, (counts.get(version) ?? 0) + 1);
    else noVersion++;
  }
  return {
    versions: [...counts].map(([version, cars]) => ({ version, cars })).sort((a, b) => compareVersions(b.version, a.version)),
    noVersion,
  };
}

export type ComponentHealthSummary = {
  component: string;
  status: Status | null; // the latest check; null when never checked
  checkedAt: string | null;
  down: number; // checks that found it not working
  lastProblemAt: string | null;
};

type DailyCheck = { component: string; day: string; up: number; total: number };
type Check = { component: string; status: string; checked_at: string };

const STATUSES: readonly string[] = ["operational", "degraded", "down"];

export function healthSummary(daily: DailyCheck[], latest: Check[], problems: { component: string; checked_at: string }[], since: string): ComponentHealthSummary[] {
  return COMPONENTS.map((component) => {
    const mine = daily.filter((r) => r.component === component && r.day >= since);
    const total = mine.reduce((sum, r) => sum + Number(r.total), 0);
    const last = latest.find((r) => r.component === component);
    return {
      component,
      status: last && STATUSES.includes(last.status) ? (last.status as Status) : null,
      checkedAt: last?.checked_at ?? null,
      down: total - mine.reduce((sum, r) => sum + Number(r.up), 0),
      lastProblemAt: problems.find((r) => r.component === component)?.checked_at ?? null,
    };
  });
}

// Totals only: no VINs, names or error text (a poll error can quote a VIN).
export async function loadAdmin(now: number): Promise<AdminPage> {
  const recent = now - RECENT_DAYS * DAY;
  // health_daily works in IST days; the window starts on the day RECENT_DAYS - 1 days ago.
  const sinceDay = istDay(now - (RECENT_DAYS - 1) * DAY);
  if (DEMO) {
    const fleet = demoFleet();
    const failed = fleet.runs.filter((r) => !r.ok);
    return {
      simulated: true,
      owners: fleet.owners,
      cars: fleet.vehicles.length,
      onlineRecently: fleet.vehicles.filter((v) => Date.parse(v.last_seen_at) >= recent).length,
      ...spread(fleet.vehicles.map((v) => v.current_version)),
      runs: {
        total: fleet.runs.length,
        failed: failed.length,
        failures: failed.slice(0, 5).map((r) => ({ at: r.started_at, userId: 1, reason: runErrorReason("fetch failed") })),
      },
      health: healthSummary(
        demoData().healthDaily,
        COMPONENTS.map((component) => ({ component, status: "operational", checked_at: new Date(now - 10 * 60_000).toISOString() })),
        [],
        sinceDay,
      ),
      notStreaming: [],
      sendsConfig: true,
      unknownCars: [],
    };
  }
  const since = new Date(recent).toISOString();
  const [totals, notStreaming, codes] = await Promise.all([
    adminTotals(since, new Date(now - RECENT_DAYS * DAY).toISOString(), COMPONENTS.length),
    carsNotStreaming(),
    // Never fails the page: shown as not known.
    carCodes().catch((err: Error) => {
      console.warn("Reading car codes failed:", err.message);
      return null;
    }),
  ]);
  const cars = totals.cars;
  return {
    simulated: false,
    owners: totals.owners,
    cars: cars.length,
    onlineRecently: cars.filter((v) => v.last_seen_at && Date.parse(v.last_seen_at) >= recent).length,
    ...spread(cars.map((v) => v.current_version)),
    runs: {
      total: totals.runs,
      failed: totals.failed,
      failures: totals.failures.map((r) => ({ at: r.started_at, userId: r.user_id === null ? null : Number(r.user_id), reason: runErrorReason(r.error) })),
    },
    health: healthSummary(totals.health as DailyCheck[], totals.latest, totals.problems, sinceDay),
    notStreaming,
    sendsConfig: canSendConfig(),
    unknownCars: codes && codes.map((c) => ({ userId: c.userId, codes: unknownCodes(c.config) })).filter((c) => c.codes.length > 0),
  };
}
