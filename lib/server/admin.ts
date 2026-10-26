import "server-only";
import { DEMO, DEMO_SITE } from "@/lib/demo";
import { compareVersions } from "@/lib/rollout";
import { istDay } from "@/lib/status";
import { normaliseVersion } from "@/lib/versions";
import { currentOwner } from "./auth";
import { demoData, demoFleet } from "./demo";
import { missingEnv } from "./env";
import { DEMO_OWNER, type Owner } from "./data/owner";
import { carsNotStreaming, type WaitingCar } from "./data/setup";
import { ADMIN_ROLE, adminTotals, userRole } from "./data/system";
import { canSendConfig } from "./telemetry-config";
import { COMPONENTS } from "./stream-health";
import { accountKinds } from "./usage";

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
  runs: { total: number; failed: number; lastFailedAt: string | null };
  // Checks that found a component down, per component, in the last RECENT_DAYS days.
  health: { component: string; down: number; total: number }[];
  // This month's estimated Fleet API cost across the developer account; Costs has what it's made of.
  // counted is false before the api_usage migration.
  api: { costUsd: number; counted: boolean };
  // Cars that don't stream to Uplink yet (/setup's two steps), by user id: null before the car_setup
  // migration. sendsConfig: whether Uplink sends the streaming config itself (its keys are set).
  notStreaming: WaitingCar[] | null;
  sendsConfig: boolean;
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

type DailyCheck = { component: string; day: string; up: number; total: number };

function healthTotals(rows: DailyCheck[], since: string): AdminPage["health"] {
  return COMPONENTS.map((component) => {
    const mine = rows.filter((r) => r.component === component && r.day >= since);
    const total = mine.reduce((sum, r) => sum + Number(r.total), 0);
    return { component, down: total - mine.reduce((sum, r) => sum + Number(r.up), 0), total };
  });
}

// Totals only: no VINs, names or error text (a poll error can quote a VIN).
export async function loadAdmin(now: number): Promise<AdminPage> {
  const recent = now - RECENT_DAYS * DAY;
  // health_daily works in IST days; the window starts on the day RECENT_DAYS - 1 days ago.
  const sinceDay = istDay(now - (RECENT_DAYS - 1) * DAY);
  const { usage, counted } = await accountKinds(now);
  const api = { costUsd: usage.costUsd, counted };
  if (DEMO) {
    const fleet = demoFleet();
    const failed = fleet.runs.filter((r) => !r.ok);
    return {
      simulated: true,
      owners: fleet.owners,
      cars: fleet.vehicles.length,
      onlineRecently: fleet.vehicles.filter((v) => Date.parse(v.last_seen_at) >= recent).length,
      ...spread(fleet.vehicles.map((v) => v.current_version)),
      runs: { total: fleet.runs.length, failed: failed.length, lastFailedAt: failed[0]?.started_at ?? null },
      health: healthTotals(demoData().healthDaily, sinceDay),
      api,
      notStreaming: [],
      sendsConfig: true,
    };
  }
  const since = new Date(recent).toISOString();
  const [totals, notStreaming] = await Promise.all([adminTotals(since, new Date(now - RECENT_DAYS * DAY).toISOString()), carsNotStreaming()]);
  const cars = totals.cars;
  return {
    simulated: false,
    owners: totals.owners,
    cars: cars.length,
    onlineRecently: cars.filter((v) => v.last_seen_at && Date.parse(v.last_seen_at) >= recent).length,
    ...spread(cars.map((v) => v.current_version)),
    runs: { total: totals.runs, failed: totals.failed, lastFailedAt: totals.lastFailedAt },
    health: healthTotals(totals.health as DailyCheck[], sinceDay),
    api,
    notStreaming,
    sendsConfig: canSendConfig(),
  };
}
