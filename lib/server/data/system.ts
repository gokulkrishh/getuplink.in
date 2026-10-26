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

// ---- Accounts: one users row per Tesla login ----

// Only an approved user can sign in, be checked by the crons or use a connector token.
export const APPROVED = "approved";

export type UserRow = {
  id: number;
  tesla_sub: string;
  status: string;
  sessions_valid_after: string;
  created_at: string;
};

const USER_COLUMNS = "id, tesla_sub, status, sessions_valid_after, created_at";

export const ownerOf = (user: Pick<UserRow, "id" | "tesla_sub">): Owner => asOwner(Number(user.id), user.tesla_sub);

// The user a session cookie names, or null when there is none (deleted account).
export async function userById(id: number): Promise<UserRow | null> {
  const { data, error } = await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
  return data ? { ...(data as UserRow), id: Number(data.id) } : null;
}

// The user a Tesla sign-in is for, or null for a Tesla account Uplink doesn't know.
export async function userBySub(sub: string): Promise<UserRow | null> {
  const { data, error } = await db().from("users").select(USER_COLUMNS).eq("tesla_sub", sub).maybeSingle();
  if (error) throw new Error(`Reading account failed: ${error.message}`);
  return data ? { ...(data as UserRow), id: Number(data.id) } : null;
}

// "Sign out everywhere" and disconnect: the user's sessions issued before `at` stop working.
export async function revokeUserSessions(owner: Owner, at: string): Promise<void> {
  check(await db().from("users").update({ sessions_valid_after: at, updated_at: at }).eq("id", owner.userId));
}

// Delete account: the users row, which cascades to every per-user table with a foreign key to it (all but
// telemetry_readings, which the caller deletes first).
export async function deleteUser(owner: Owner): Promise<void> {
  check(await db().from("users").delete().eq("id", owner.userId));
}

// Whom the crons check: every approved user, except one who disconnected (a user_tokens row with no
// tokens). An approved user with no user_tokens row yet is checked: for the owner at cutover, that first
// check is what copies the tokens over (see lib/server/tesla.ts); for anyone else it fails with "not
// connected", as a missing token always has.
export async function accountOwners(): Promise<Owner[]> {
  const [users, disconnected] = await Promise.all([
    db().from("users").select("id, tesla_sub").eq("status", APPROVED).order("id"),
    db().from("user_tokens").select("user_id").is("access_token_enc", null),
  ]);
  if (users.error) throw new Error(`Reading accounts failed: ${users.error.message}`);
  if (disconnected.error) throw new Error(`Reading accounts failed: ${disconnected.error.message}`);
  const off = new Set((disconnected.data ?? []).map((r) => Number(r.user_id)));
  return (users.data ?? []).filter((u) => !off.has(Number(u.id))).map((u) => ownerOf(u as UserRow));
}

// How many users exist, whatever their status. Admin's total.
export async function accountCount(): Promise<number> {
  const { count, error } = await db().from("users").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// The MCP connector token with this hash and the approved user it belongs to, or null when there is none.
// The caller compares the hash again in constant time.
export async function connectorTokenAccount(tokenHash: string): Promise<{ owner: Owner; tokenHash: string; usedAt: string | null } | null> {
  const { data, error } = await db().from("connector_token").select("user_id, token_hash, used_at").eq("token_hash", tokenHash).limit(1).maybeSingle();
  if (error) {
    if (!MISSING_TABLE.includes(error.code)) console.warn("Connector token unavailable:", error.message);
    return null;
  }
  if (!data) return null;
  const user = await userById(Number(data.user_id));
  if (user?.status !== APPROVED) return null;
  return { owner: ownerOf(user), tokenHash: data.token_hash as string, usedAt: (data.used_at as string | null) ?? null };
}

// ---- The single-owner token row (oauth_tokens), read only at the token cutover ----
// Until step 4 drops it, oauth_tokens holds the pair the old code used. lib/server/tesla.ts copies it to
// user_tokens once, under the refresh lease, then empties it here. owner_sub stays: legacy_owner_id(),
// the default user_id of every streamed reading, still reads it.

export type LegacyTokens = {
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string | null;
  scope: string | null;
  refreshing_until: string | null;
  created_at: string;
  updated_at: string;
};

// The pair still in oauth_tokens for this Tesla account, or null when it is empty or someone else's.
export async function legacyTokens(sub: string): Promise<LegacyTokens | null> {
  const { data, error } = await db()
    .from("oauth_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at, scope, refreshing_until, created_at, updated_at")
    .eq("provider", "tesla")
    .eq("owner_sub", sub)
    .maybeSingle();
  if (error) {
    if (MISSING_TABLE.includes(error.code)) return null;
    throw new Error(`Reading tokens failed: ${error.message}`);
  }
  return data?.access_token_enc && data.refresh_token_enc ? (data as LegacyTokens) : null;
}

// Takes the refresh lease on the pair we read, so neither a refresh nor another copy can run on it. The
// lease must be free: never taken, released, or run out before `freeBefore`.
export async function claimLegacyLease(sub: string, refreshTokenEnc: string, until: string, freeBefore: string): Promise<boolean> {
  const { data, error } = await db()
    .from("oauth_tokens")
    .update({ refreshing_until: until })
    .eq("provider", "tesla")
    .eq("owner_sub", sub)
    .eq("refresh_token_enc", refreshTokenEnc)
    .or(`refreshing_until.is.null,refreshing_until.lt.${freeBefore}`)
    .select("provider");
  if (error) throw new Error(`Claiming the token copy failed: ${error.message}`);
  return data?.length === 1;
}

// Gives the lease back after a copy that failed, so the next try needn't wait for it to run out.
export async function releaseLegacyLease(sub: string, refreshTokenEnc: string): Promise<void> {
  await db().from("oauth_tokens").update({ refreshing_until: null }).eq("provider", "tesla").eq("owner_sub", sub).eq("refresh_token_enc", refreshTokenEnc);
}

// Empties the pair (keeping owner_sub), so nothing can present it to Tesla again. With refreshTokenEnc,
// only while it still holds that pair.
export async function retireLegacyTokens(sub: string, refreshTokenEnc?: string): Promise<void> {
  let query = db()
    .from("oauth_tokens")
    .update({ access_token_enc: null, refresh_token_enc: null, expires_at: null, refreshing_until: null, updated_at: new Date().toISOString() })
    .eq("provider", "tesla")
    .eq("owner_sub", sub);
  if (refreshTokenEnc) query = query.eq("refresh_token_enc", refreshTokenEnc);
  const { error } = await query;
  if (error && !MISSING_TABLE.includes(error.code)) throw new Error(`Clearing the old tokens failed: ${error.message}`);
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

// A car two users both track has a copy of its rows under each. Fleet totals count it once: every row of
// a car comes from one user's copy, the lowest user id that has it, and the other copies are dropped.
export function oneCopyPerCar<T>(rows: T[], car: (row: T) => string, user: (row: T) => number): T[] {
  const keeper = new Map<string, number>();
  for (const row of rows) {
    const key = car(row);
    const id = user(row);
    const kept = keeper.get(key);
    if (kept === undefined || id < kept) keeper.set(key, id);
  }
  return rows.filter((row) => keeper.get(car(row)) === user(row));
}

const withoutUser = <T extends { user_id: unknown }>({ user_id: _, ...row }: T): Omit<T, "user_id"> => row;

export type FleetChange = { car: string; version: string; previous: string | null; at: string; source: string };

// Every version_history row across all cars, in pages of PAGE, one copy per car.
export async function fleetVersionChanges(): Promise<FleetChange[]> {
  const rows: (FleetChange & { user_id: number })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("version_history")
      .select("car:vehicle_id::text, version, previous:previous_version, at:detected_at, source, user_id")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as (FleetChange & { user_id: number })[]));
    if (data.length < PAGE) break;
  }
  return oneCopyPerCar(rows, (r) => r.car, (r) => Number(r.user_id)).map(withoutUser);
}

export type FleetOffer = { car: string; version: string | null; status: string | null; offered: string | null };

// Every car's version and the update its last online check saw offered, one copy per car.
export async function fleetOffers(): Promise<FleetOffer[]> {
  const { data, error } = await db()
    .from("vehicles")
    // Named key: once the users migration adds (user_id, vehicle_id), PostgREST sees two links between the
    // tables and refuses an embed that doesn't say which one.
    .select("car:id::text, user_id, version:current_version, snapshots!snapshots_vehicle_id_fkey(status:update_status, offered:update_version)")
    .eq("snapshots.state", "online")
    .order("polled_at", { referencedTable: "snapshots", ascending: false })
    .limit(1, { referencedTable: "snapshots" });
  if (error) throw new Error(error.message);
  type Row = { car: string; user_id: number; version: string | null; snapshots: { status: string | null; offered: string | null }[] };
  return oneCopyPerCar(data as unknown as Row[], (r) => r.car, (r) => Number(r.user_id)).map(({ car, version, snapshots }) => ({
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

// A car by its VIN, or its id before a check has seen the VIN.
const carKey = (r: { vin: string | null; id?: string }) => r.vin ?? `id:${r.id}`;

// Every car with its version and home state, one copy per car.
export async function fleetCars(): Promise<FleetCar[]> {
  let vehicles = await db().from("vehicles").select("id:id::text, vin, current_version, home_state, user_id");
  if (vehicles.error && MISSING_STATE.includes(vehicles.error.code)) {
    vehicles = await db().from("vehicles").select("id:id::text, vin, current_version, user_id");
  }
  if (vehicles.error) throw new Error(vehicles.error.message);
  return oneCopyPerCar(vehicles.data as (FleetCar & { user_id: number })[], carKey, (r) => Number(r.user_id)).map(withoutUser);
}

// Every Supercharger visit's site per VIN, oldest first (the fallback for a car's home state), one copy
// per car.
export async function fleetSuperchargerSites(): Promise<{ vehicle_vin: string | null; site_name: string | null }[] | null> {
  type Row = { vehicle_vin: string | null; site_name: string | null; user_id: number };
  const out: Row[] = [];
  const done = () => oneCopyPerCar(out, (r) => r.vehicle_vin ?? "", (r) => Number(r.user_id)).map(withoutUser);
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("charging_sessions")
      .select("vehicle_vin, site_name, user_id")
      .order("started_at")
      .order("session_id")
      .range(from, from + PAGE - 1);
    if (error) {
      if (MISSING_STATE.includes(error.code)) return done();
      throw new Error(error.message);
    }
    out.push(...(data as Row[]));
    if (data.length < PAGE) return done();
  }
}

// ---- Admin: totals only ----

function count(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function adminTotals(since: string, usageSince: string, healthSince: string) {
  const [owners, vehicles, runs, failed, lastFailed, health, checks] = await Promise.all([
    db().from("users").select("id", { count: "exact", head: true }).eq("status", APPROVED),
    db().from("vehicles").select("id:id::text, vin, current_version, last_seen_at, user_id"),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since).eq("ok", false),
    db().from("poll_runs").select("started_at").eq("ok", false).gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db().rpc("health_daily", { since: healthSince }),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", usageSince),
  ]);
  return {
    owners: count(owners),
    cars: oneCopyPerCar(
      check(vehicles) as { id: string; vin: string | null; current_version: string | null; last_seen_at: string | null; user_id: number }[],
      carKey,
      (r) => Number(r.user_id),
    ).map(({ current_version, last_seen_at }) => ({ current_version, last_seen_at })),
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

// The car whose streaming config the health check asks Tesla about, and the user whose token asks: the
// first car with a VIN, with its own user. Null when there is none; owner is null when its user isn't
// approved, so nobody else's token ever asks about it.
export async function healthCheckCar(): Promise<{ owner: Owner | null; vin: string } | null> {
  const { data, error } = await db().from("vehicles").select("vin, user_id").not("vin", "is", null).order("user_id").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.vin) return null;
  const user = await userById(Number(data.user_id));
  return { owner: user?.status === APPROVED ? ownerOf(user) : null, vin: data.vin as string };
}

// ---- Telemetry retention ----

export function pruneTelemetryBatch(args: Record<string, unknown>) {
  return db().rpc("prune_telemetry_readings", args);
}
