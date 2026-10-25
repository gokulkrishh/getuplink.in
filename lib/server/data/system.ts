import "server-only";
import { db } from "@/lib/server/supabase";
import { asOwner, type Owner } from "./owner";

// Fleet-wide reads and writes: everything that isn't one account's, or that runs before there is an
// account to scope to (sign-in, the session check, the connector token). Each is named for what it reads,
// and none hands a car's rows to an owner's page: rollout and admin reduce them to totals.

const MISSING_TABLE = ["42P01", "PGRST205"];

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// ---- Accounts ----

export type AccountRow = {
  owner_sub: string | null;
  access_token_enc: string | null;
  created_at: string;
  updated_at: string;
  sessions_valid_after: string;
};

// The one account Uplink has today (oauth_tokens' single row), or null before the first sign-in. The
// session cookie names no account, so a current session is this account's. Step 3: the cookie carries
// the user and this goes.
export async function legacyAccount(): Promise<AccountRow | null> {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, created_at, updated_at, sessions_valid_after, owner_sub")
    .eq("provider", "tesla")
    .maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
  return data as AccountRow | null;
}

export type ClaimResult = "claimed" | "owner" | "not-owner";

// Sign in with Tesla: the first account to sign in becomes the owner, and only that account can sign in
// afterwards. Makes sure the row exists without touching an existing one, then claims it with a single
// conditional update: of two first sign-ins racing, only one can match "no owner or me".
export async function claimAccount(sub: string, tokens: Record<string, unknown>): Promise<ClaimResult> {
  const { error: insertError } = await db()
    .from("oauth_tokens")
    .upsert({ provider: "tesla" }, { onConflict: "provider", ignoreDuplicates: true });
  if (insertError) throw new Error(`Saving tokens failed: ${insertError.message}`);
  const { data: before, error: readError } = await db().from("oauth_tokens").select("owner_sub").eq("provider", "tesla").maybeSingle();
  if (readError) throw new Error(`Reading owner failed: ${readError.message}`);
  const quoted = `"${sub.replace(/[\\"]/g, "\\$&")}"`;
  const { data: updated, error } = await db()
    .from("oauth_tokens")
    .update({ owner_sub: sub, ...tokens })
    .eq("provider", "tesla")
    .or(`owner_sub.is.null,owner_sub.eq.${quoted}`)
    .select("provider");
  if (error) throw new Error(`Saving tokens failed: ${error.message}`);
  if (!updated?.length) return "not-owner";
  return before?.owner_sub ? "owner" : "claimed";
}

// Every account that has signed in, connected or not: whom the crons check (a disconnected one fails its
// check with "not connected", as it always has). One at most today.
export async function accountOwners(): Promise<Owner[]> {
  const { data, error } = await db().from("oauth_tokens").select("owner_sub").not("owner_sub", "is", null);
  if (error) throw new Error(`Reading accounts failed: ${error.message}`);
  return (data ?? []).map((r) => asOwner(r.owner_sub as string));
}

// How many accounts exist (signed in at least once). Admin's total, and Delete my data's test for rows
// that carry no owner yet (see ownedRows).
export async function accountCount(): Promise<number> {
  const { count, error } = await db().from("oauth_tokens").select("provider", { count: "exact", head: true }).not("owner_sub", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// The MCP connector's token and the account it belongs to (there is one of each today), or null when
// none is set up. The caller compares the hash.
export async function connectorTokenAccount(): Promise<{ owner: Owner; tokenHash: string; usedAt: string | null } | null> {
  const { data, error } = await db().from("connector_token").select("token_hash, used_at").eq("owner", "tesla").maybeSingle();
  if (error) {
    if (!MISSING_TABLE.includes(error.code)) console.warn("Connector token unavailable:", error.message);
    return null;
  }
  if (!data) return null;
  const account = await legacyAccount();
  if (!account?.owner_sub) return null;
  return { owner: asOwner(account.owner_sub), tokenHash: data.token_hash as string, usedAt: (data.used_at as string | null) ?? null };
}

// ---- The check lock (poll_runs) ----
// poll_runs allows one unfinished row (poll_runs_one_running_idx): inserting one is taking the lock. One
// lock for every account today; step 5 makes it one per user.

export async function closeStaleRuns(startedBefore: string): Promise<void> {
  check(
    await db()
      .from("poll_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: "Did not finish" })
      .is("finished_at", null)
      .lt("started_at", startedBefore),
  );
}

// The new run's id, or null when another run holds the lock.
export async function startRun(uniqueViolation: string): Promise<number | null> {
  const { data, error } = await db().from("poll_runs").insert({}).select("id").single();
  if (error?.code === uniqueViolation) return null;
  if (error || !data) throw new Error(error?.message ?? "Could not start a check");
  return data.id as number;
}

export async function finishRun(id: number, fields: { ok: boolean; vehicles_seen?: number; error: string | null }): Promise<void> {
  check(
    await db()
      .from("poll_runs")
      .update({ finished_at: new Date().toISOString(), ...fields })
      .eq("id", id)
      .is("finished_at", null),
  );
}

// True while a run holds the lock and isn't stale.
export async function runInProgress(startedAfter: string): Promise<boolean> {
  const running = check(await db().from("poll_runs").select("id").is("finished_at", null).gte("started_at", startedAfter).limit(1).maybeSingle());
  return Boolean(running);
}

// ---- Shared caches: the same for every account ----

// Tesla's release notes, keyed by version (public text, not an owner's data).
export async function releaseNotesFor(versions: string[]) {
  return db().from("release_notes").select("version, notes, raw").in("version", versions);
}

export async function storedNoteVersions(versions: string[]): Promise<Set<string>> {
  const { data } = await db().from("release_notes").select("version").in("version", versions);
  return new Set((data ?? []).map((r: { version: string }) => r.version));
}

export async function saveReleaseNotes(version: string, notes: unknown, raw: unknown): Promise<void> {
  check(await db().from("release_notes").upsert({ version, notes, raw }, { onConflict: "version", ignoreDuplicates: true }));
}

export async function recentReleaseNotes(limit: number) {
  return db().from("release_notes").select("version, fetched_at, notes, raw").order("fetched_at", { ascending: false }).limit(limit);
}

// Nominatim names by rounded point. Keys hold no owner: a name is shared by anyone parked there.
export async function placeNamesFor(keys: string[]) {
  return db().from("place_names").select("key, name").in("key", keys);
}

export async function savePlaceName(key: string, name: string | null): Promise<void> {
  await db().from("place_names").upsert({ key, name, looked_up_at: new Date().toISOString() }, { onConflict: "key" });
}

// ---- Rollout: every car's versions, reduced to totals by lib/rollout ----

const PAGE = 1000; // PostgREST's default row cap per request

export type FleetChange = { car: string; version: string; previous: string | null; at: string; source: string };

// Every version_history row across all cars, in pages of PAGE.
export async function fleetVersionChanges(): Promise<FleetChange[]> {
  const rows: FleetChange[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("version_history")
      .select("car:vehicle_id::text, version, previous:previous_version, at:detected_at, source")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as FleetChange[]));
    if (data.length < PAGE) return rows;
  }
}

export type FleetOffer = { car: string; version: string | null; status: string | null; offered: string | null };

// Every car's version and the update its last online check saw offered.
export async function fleetOffers(): Promise<FleetOffer[]> {
  const { data, error } = await db()
    .from("vehicles")
    .select("car:id::text, version:current_version, snapshots(status:update_status, offered:update_version)")
    .eq("snapshots.state", "online")
    .order("polled_at", { referencedTable: "snapshots", ascending: false })
    .limit(1, { referencedTable: "snapshots" });
  if (error) throw new Error(error.message);
  type Row = { car: string; version: string | null; snapshots: { status: string | null; offered: string | null }[] };
  return (data as unknown as Row[]).map(({ car, version, snapshots }) => ({
    car,
    version,
    status: snapshots[0]?.status ?? null,
    offered: snapshots[0]?.offered ?? null,
  }));
}

// Before the home_state migration (42703) or without the charging history table (42P01, PGRST205), a car
// simply has no state yet.
const MISSING_STATE = ["42703", ...MISSING_TABLE];

export type FleetCar = { id: string; vin: string | null; current_version: string | null; home_state?: string | null };

// Every car with its version and home state.
export async function fleetCars(): Promise<FleetCar[]> {
  let vehicles = await db().from("vehicles").select("id:id::text, vin, current_version, home_state");
  if (vehicles.error && MISSING_STATE.includes(vehicles.error.code)) {
    vehicles = await db().from("vehicles").select("id:id::text, vin, current_version");
  }
  if (vehicles.error) throw new Error(vehicles.error.message);
  return vehicles.data as FleetCar[];
}

// Every Supercharger visit's site per VIN, oldest first (the fallback for a car's home state).
export async function fleetSuperchargerSites(): Promise<{ vehicle_vin: string | null; site_name: string | null }[] | null> {
  const out: { vehicle_vin: string | null; site_name: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("charging_sessions")
      .select("vehicle_vin, site_name")
      .order("started_at")
      .order("session_id")
      .range(from, from + PAGE - 1);
    if (error) {
      if (MISSING_STATE.includes(error.code)) return out;
      throw new Error(error.message);
    }
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

// ---- Admin: totals only ----

function count(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function adminTotals(since: string, usageSince: string, healthSince: string) {
  const [owners, vehicles, runs, failed, lastFailed, health, checks] = await Promise.all([
    db().from("oauth_tokens").select("provider", { count: "exact", head: true }).not("owner_sub", "is", null),
    db().from("vehicles").select("current_version, last_seen_at"),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since).eq("ok", false),
    db().from("poll_runs").select("started_at").eq("ok", false).gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db().rpc("health_daily", { since: healthSince }),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", usageSince),
  ]);
  return {
    owners: count(owners),
    cars: check(vehicles) as { current_version: string | null; last_seen_at: string | null }[],
    runs: count(runs),
    failed: count(failed),
    lastFailedAt: ((check(lastFailed) as { started_at: string } | null)?.started_at as string | undefined) ?? null,
    health: check(health) as { component: string; day: string; up: number; total: number }[],
    checks: count(checks),
  };
}

// ---- Status page and health checks ----

export type DailyCheck = { component: string; day: string; status: string; up: number; total: number };
export type LatestCheck = { component: string; status: string; checked_at: string };

export async function healthHistory(since: string, latest: number): Promise<{ daily: DailyCheck[]; latest: LatestCheck[] }> {
  const [daily, recent] = await Promise.all([
    db().rpc("health_daily", { since }),
    db().from("health_checks").select("component, status, checked_at").order("checked_at", { ascending: false }).limit(latest),
  ]);
  return { daily: check(daily) as DailyCheck[], latest: check(recent) as LatestCheck[] };
}

export async function lastHealthCheckAt(): Promise<string | null> {
  const data = check(await db().from("health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle());
  return (data?.checked_at as string | undefined) ?? null;
}

// One row per component, then drops rows past the retention window. One delete per component so each uses
// the (component, checked_at) index.
export async function recordHealthChecks(checkedAt: string, rows: { component: string; status: string }[], components: readonly string[], cutoff: string) {
  check(await db().from("health_checks").insert(rows.map((r) => ({ checked_at: checkedAt, ...r }))));
  await Promise.all(components.map((name) => db().from("health_checks").delete().eq("component", name).lt("checked_at", cutoff)));
}

// The health check's database probe.
export function pingDatabase() {
  return db().from("vehicles").select("vin").limit(1);
}

// When any car was last online at a check, and when any car last streamed: the stream's freshness.
export function fleetLastSeen() {
  return db().from("vehicles").select("last_seen_at").not("last_seen_at", "is", null).order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
}

export async function fleetLastReadingAt(): Promise<string | null> {
  const { data, error } = await db().from("telemetry_readings").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.created_at as string | undefined) ?? null;
}

// The car whose streaming config the health check asks Tesla about, and whose token asks: the first car
// with a VIN. Null when there is none; owner is null when no account has signed in.
export async function healthCheckCar(): Promise<{ owner: Owner | null; vin: string } | null> {
  const { data, error } = await db().from("vehicles").select("vin").not("vin", "is", null).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.vin) return null;
  const [owner] = await accountOwners();
  return { owner: owner ?? null, vin: data.vin as string };
}

// ---- Telemetry retention ----

export function pruneTelemetryBatch(args: Record<string, unknown>) {
  return db().rpc("prune_telemetry_readings", args);
}
