import "server-only";
import { isAdminAccount } from "@/lib/admin";
import { DEMO } from "@/lib/demo";
import { compareVersions } from "@/lib/rollout";
import { istDay } from "@/lib/status";
import { normaliseVersion } from "@/lib/versions";
import { hasCurrentSession } from "./auth";
import { demoData, demoFleet } from "./demo";
import { adminAccounts, missingEnv } from "./env";
import { db } from "./supabase";
import { COMPONENTS } from "./stream-health";
import { ownerSub } from "./tesla";

const DAY = 86_400_000;
export const RECENT_DAYS = 7;
export const USAGE_DAYS = 30;

// /admin is for the accounts in ADMIN_ACCOUNTS. The session cookie names no account, but there is one owner
// (oauth_tokens.owner_sub) and only that account can sign in, so a current session is the owner's: admin
// means a current session and the owner listed. In demo mode the demo owner is an admin.
export async function isAdmin(): Promise<boolean> {
  if (DEMO) return true;
  const allowed = adminAccounts();
  if (!allowed.size || missingEnv().length) return false;
  if (!(await hasCurrentSession())) return false;
  return isAdminAccount(await ownerSub(), allowed);
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
  // Fleet API requests and cost aren't counted yet. Real data shows the number of checks instead (each one
  // makes a few Fleet API calls); the demo shows simulated figures.
  api: { kind: "simulated"; requests: number; costUsd: number } | { kind: "checks"; checks: number };
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

function count(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
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
      runs: { total: fleet.runs.length, failed: failed.length, lastFailedAt: failed[0]?.started_at ?? null },
      health: healthTotals(demoData().healthDaily, sinceDay),
      api: { kind: "simulated", ...fleet.api },
    };
  }
  const since = new Date(recent).toISOString();
  const [owners, vehicles, runs, failed, lastFailed, health, checks] = await Promise.all([
    db().from("oauth_tokens").select("provider", { count: "exact", head: true }).not("owner_sub", "is", null),
    db().from("vehicles").select("current_version, last_seen_at"),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since).eq("ok", false),
    db().from("poll_runs").select("started_at").eq("ok", false).gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db().rpc("health_daily", { since: new Date(now - RECENT_DAYS * DAY).toISOString() }),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", new Date(now - USAGE_DAYS * DAY).toISOString()),
  ]);
  if (vehicles.error) throw new Error(vehicles.error.message);
  if (lastFailed.error) throw new Error(lastFailed.error.message);
  if (health.error) throw new Error(health.error.message);
  const cars = vehicles.data as { current_version: string | null; last_seen_at: string | null }[];
  return {
    simulated: false,
    owners: count(owners),
    cars: cars.length,
    onlineRecently: cars.filter((v) => v.last_seen_at && Date.parse(v.last_seen_at) >= recent).length,
    ...spread(cars.map((v) => v.current_version)),
    runs: { total: count(runs), failed: count(failed), lastFailedAt: (lastFailed.data?.started_at as string | undefined) ?? null },
    health: healthTotals(health.data as DailyCheck[], sinceDay),
    api: { kind: "checks", checks: count(checks) },
  };
}
