import "server-only";
import { DEMO, DEMO_SITE } from "@/lib/demo";
import { compareVersions } from "@/lib/rollout";
import { accountLabel, failureOutcome, type Outcome } from "@/lib/failed-checks";
import { istDay, type Status } from "@/lib/status";
import { runErrorReason } from "@/lib/run-error";
import { normaliseVersion } from "@/lib/versions";
import { sessionAccount } from "./auth";
import { demoData, demoFleet } from "./demo";
import { missingEnv } from "./env";
import { DEMO_OWNER, type Owner } from "./data/owner";
import { carsNotStreaming, type WaitingCar } from "./data/setup";
import { unknownCodes } from "@/lib/car";
import { accountCars, ADMIN_ROLE, adminTotals, carCodes, failureContext, ownerOf } from "./data/system";
import { canSendConfig } from "./telemetry-config";
import { COMPONENTS } from "./stream-health";

const DAY = 86_400_000;
export const RECENT_DAYS = 7;

// The admin is a role on the users row (users.role = 'admin', set by hand), never anything in code or env.
// Admin means a current session (currentOwner: signed, not revoked, approved) whose user has that role,
// read fresh from the database in the session check's own read. Uncached: every admin action calls this again. In demo mode the demo
// owner is an admin.
export async function adminOwner(): Promise<Owner | null> {
  // The public demo site has no admin: no Admin, Waitlist or Costs in its menu, and those pages are a 404.
  // Local demo mode (UPLINK_DEMO=1) keeps them, to preview them while building.
  if (DEMO_SITE) return null;
  if (DEMO) return DEMO_OWNER;
  if (missingEnv().length) return null;
  const user = await sessionAccount();
  return user?.role === ADMIN_ROLE ? ownerOf(user) : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await adminOwner()) !== null;
}

type AccountName = ReturnType<typeof accountLabel>;

export type FailedCheck = {
  at: string;
  userId: number | null;
  reason: string;
  account: AccountName | null;
  outcome: Outcome | null; // null when the check has no account
};

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
  // `account` names the account like Admin > Access does; `outcome` says whether it was fixed since.
  runs: { total: number; failed: number; failures: FailedCheck[] };
  // Per component: its latest check, and the checks that found it not working in the last RECENT_DAYS days.
  health: ComponentHealthSummary[];
  // Cars that don't stream to Uplink yet (/setup's two steps), by user id: null before the car_setup
  // migration. sendsConfig: whether Uplink sends the streaming config itself (its keys are set).
  notStreaming: (WaitingCar & { account: AccountName })[] | null;
  sendsConfig: boolean;
  // Cars reporting a model or pack code lib/car.ts doesn't know yet, by user id; null when it couldn't be read.
  unknownCars: { userId: number; account: AccountName; codes: string[] }[] | null;
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
        failures: failed.slice(0, 5).map((r) => {
          const failure = { at: r.started_at, reason: runErrorReason("fetch failed") };
          const lastGoodAt = fleet.runs.find((o) => o.ok && o.started_at > r.started_at)?.started_at ?? null;
          return { ...failure, userId: 1, account: accountLabel(1, { name: "Demo Model Y", vinSuffix: "D30519" }), outcome: failureOutcome(failure, { lastGoodAt, tokensSavedAt: null }) };
        }),
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
  const failedUsers = [...new Set(totals.failures.flatMap((r) => (r.user_id === null ? [] : [Number(r.user_id)])))];
  const listed = [...new Set([...failedUsers, ...(notStreaming ?? []).map((c) => c.userId), ...(codes ?? []).map((c) => c.userId)])];
  // Naming and "fixed since" are extras: if reading them fails, the lists still show each row.
  const [named, later] = await Promise.all([
    accountCars(listed).catch(() => new Map<number, { name: string | null; vinSuffix: string | null }>()),
    failureContext(totals.failures.flatMap((r) => (r.user_id === null ? [] : [{ userId: Number(r.user_id), at: r.started_at }]))).catch(() => null),
  ]);
  const account = (userId: number) => accountLabel(userId, named.get(userId));
  return {
    simulated: false,
    owners: totals.owners,
    cars: cars.length,
    onlineRecently: cars.filter((v) => v.last_seen_at && Date.parse(v.last_seen_at) >= recent).length,
    ...spread(cars.map((v) => v.current_version)),
    runs: {
      total: totals.runs,
      failed: totals.failed,
      failures: totals.failures.map((r) => {
        const userId = r.user_id === null ? null : Number(r.user_id);
        const reason = runErrorReason(r.error);
        const known = userId === null ? undefined : later?.get(userId);
        return {
          at: r.started_at,
          userId,
          reason,
          account: userId === null ? null : account(userId),
          outcome: known ? failureOutcome({ at: r.started_at, reason }, known) : null,
        };
      }),
    },
    health: healthSummary(totals.health as DailyCheck[], totals.latest, totals.problems, sinceDay),
    notStreaming: notStreaming && notStreaming.map((c) => ({ ...c, account: account(c.userId) })),
    sendsConfig: canSendConfig(),
    unknownCars: codes && codes.map((c) => ({ userId: c.userId, account: account(c.userId), codes: unknownCodes(c.config) })).filter((c) => c.codes.length > 0),
  };
}
