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

// Delete account: the users row, which cascades to every per-user table. Streamed readings aren't one
// user's: the caller first deletes those nobody may see any more. An invite they joined through keeps its
// row (used, so it can't be used again) but loses the car it named and the admin's note, which may name
// the person (erasure, DPDP Act s. 8(7)); the foreign key clears used_by.
export async function deleteUser(owner: Owner): Promise<void> {
  const invites = await db().from("invites").update({ joined_label: null, label: null }).eq("used_by", owner.userId);
  if (invites.error && !MISSING_TABLE.includes(invites.error.code ?? "")) throw new Error(invites.error.message);
  check(await db().from("users").delete().eq("id", owner.userId));
}

// Whom the crons check: every approved user with Tesla tokens. Anyone approved from the waitlist has no
// tokens until they sign in, so checking them would only fail every run with "not connected". A user who
// disconnected keeps an empty row and isn't checked.
export async function accountOwners(): Promise<Owner[]> {
  const [users, connected] = await Promise.all([
    db().from("users").select("id, tesla_sub").eq("status", APPROVED).order("id"),
    db().from("user_tokens").select("user_id").not("access_token_enc", "is", null),
  ]);
  for (const result of [users, connected]) {
    if (result.error) throw new Error(`Reading accounts failed: ${result.error.message}`);
  }
  const hasTokens = new Set((connected.data ?? []).map((r) => Number(r.user_id)));
  return (users.data ?? []).filter((u) => hasTokens.has(Number(u.id))).map((u) => ownerOf(u as UserRow));
}

// ---- The waitlist and the admin role (step 6) ----

export const WAITLIST = "waitlist";
export const DECLINED = "declined";
export const SUSPENDED = "suspended";
export const ADMIN_ROLE = "admin";

// The user's role, read fresh on every admin check (never cached). Null for no such user, and while the
// role column doesn't exist yet (its migration not applied): then nobody is an admin.
export async function userRole(id: number): Promise<string | null> {
  const { data, error } = await db().from("users").select("role").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return null; // undefined column
    throw new Error(`Reading account failed: ${error.message}`);
  }
  return (data?.role as string | undefined) ?? null;
}

// A Tesla login Uplink doesn't know asks to join: a users row with its Tesla account id and status
// waitlist, nothing else (created_at is when it asked). A repeat changes nothing, so it keeps its place.
export async function joinWaitlist(sub: string): Promise<void> {
  check(await db().from("users").upsert({ tesla_sub: sub, status: WAITLIST }, { onConflict: "tesla_sub", ignoreDuplicates: true }));
}

export type AccountRow = { id: number; status: string; created_at: string; approved_at: string | null; updated_at: string };

// Every account but the admins', for /admin/waitlist, oldest first: no Tesla ids, no names.
export async function waitlistAccounts(): Promise<AccountRow[]> {
  const rows = check(
    await db().from("users").select("id, status, created_at, approved_at, updated_at").neq("role", ADMIN_ROLE).order("created_at", { ascending: true }),
  ) as AccountRow[] | null;
  return (rows ?? []).map((r) => ({ ...r, id: Number(r.id) }));
}

// Approved users, admins included: the places used against MAX_USERS.
export async function approvedCount(): Promise<number> {
  const { count, error } = await db().from("users").select("id", { count: "exact", head: true }).eq("status", APPROVED);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Moves one account from one of the `from` states to `to`, never an admin's. True when it moved; false
// when it isn't in one of those states (decided meanwhile) or doesn't exist.
export async function moveAccount(id: number, from: string[], to: string): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = check(
    await db()
      .from("users")
      .update({ status: to, updated_at: now, ...(to === APPROVED ? { approved_at: now } : {}) })
      .eq("id", id)
      .in("status", from)
      .neq("role", ADMIN_ROLE)
      .select("id"),
  ) as unknown[] | null;
  return (rows?.length ?? 0) === 1;
}

// A Tesla login joins through an invite: approved at once. A waitlist row already there is moved (approve,
// as the admin would); otherwise a new row with its Tesla account id. The row it ends as, or null when the
// account is neither new nor waiting (decided meanwhile).
export async function approveThroughInvite(sub: string, existing: UserRow | null): Promise<UserRow | null> {
  if (existing) {
    if (!(await moveAccount(existing.id, [WAITLIST], APPROVED))) return null;
  } else {
    const now = new Date().toISOString();
    check(
      await db()
        .from("users")
        .upsert({ tesla_sub: sub, status: APPROVED, approved_at: now, updated_at: now }, { onConflict: "tesla_sub", ignoreDuplicates: true }),
    );
  }
  const user = await userBySub(sub);
  return user?.status === APPROVED ? user : null;
}

// ---- Invite links (step 7) ----

// Before the invites migration there is no table: invites are unavailable, and sign-in carries on without them.
export class InvitesUnavailable extends Error {
  constructor() {
    super("Invites aren't set up yet");
  }
}

function inviteCheck<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error && MISSING_TABLE.includes(result.error.code ?? "")) throw new InvitesUnavailable();
  return check(result);
}

export type InviteRow = {
  id: number;
  token_hash: string;
  vin_suffix: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: number | null;
  joined_label: string | null;
  revoked_at: string | null;
};

const INVITE_COLUMNS = "id, token_hash, vin_suffix, label, created_at, expires_at, used_at, used_by, joined_label, revoked_at";
const asInvite = (r: InviteRow): InviteRow => ({ ...r, id: Number(r.id), used_by: r.used_by == null ? null : Number(r.used_by) });

// The invite with this token hash, or null. The caller compares the hash again in constant time.
export async function inviteByHash(tokenHash: string): Promise<InviteRow | null> {
  const row = inviteCheck(await db().from("invites").select(INVITE_COLUMNS).eq("token_hash", tokenHash).limit(1).maybeSingle()) as InviteRow | null;
  return row ? asInvite(row) : null;
}

export async function inviteById(id: number): Promise<InviteRow | null> {
  const row = inviteCheck(await db().from("invites").select(INVITE_COLUMNS).eq("id", id).maybeSingle()) as InviteRow | null;
  return row ? asInvite(row) : null;
}

export async function insertInvite(row: {
  token_hash: string;
  vin_suffix: string;
  label: string | null;
  created_by: number;
  created_at: string;
  expires_at: string;
}): Promise<InviteRow> {
  return asInvite(inviteCheck(await db().from("invites").insert(row).select(INVITE_COLUMNS).single()) as InviteRow);
}

// The admin's list: the latest invites, newest first, each with the status of the account that joined.
export async function recentInvites(limit: number): Promise<(InviteRow & { joinedStatus: string | null })[]> {
  const result = await db().from("invites").select(INVITE_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  const rows = ((inviteCheck(result) ?? []) as InviteRow[]).map(asInvite);
  const ids = [...new Set(rows.flatMap((r) => (r.used_by === null ? [] : [r.used_by])))];
  const users = ids.length ? ((check(await db().from("users").select("id, status").in("id", ids)) ?? []) as { id: number; status: string }[]) : [];
  const status = new Map(users.map((u) => [Number(u.id), u.status]));
  return rows.map((r) => ({ ...r, joinedStatus: r.used_by === null ? null : (status.get(r.used_by) ?? null) }));
}

// Claims an invite for one sign-in: one conditional update, so of two sign-ins racing through the same
// link only one gets it. True when this call claimed it.
export async function claimInvite(id: number, now: string): Promise<boolean> {
  const rows = inviteCheck(
    await db().from("invites").update({ used_at: now }).eq("id", id).is("used_at", null).is("revoked_at", null).gt("expires_at", now).select("id"),
  ) as unknown[] | null;
  return (rows?.length ?? 0) === 1;
}

// Hands a claim back when the sign-in that claimed it failed before anyone joined.
export async function releaseInvite(id: number): Promise<void> {
  inviteCheck(await db().from("invites").update({ used_at: null }).eq("id", id).is("used_by", null));
}

export async function recordInviteUse(id: number, userId: number, joined: string): Promise<void> {
  inviteCheck(await db().from("invites").update({ used_by: userId, joined_label: joined }).eq("id", id));
}

// True when it was unused and is now revoked.
export async function revokeInviteRow(id: number, now: string): Promise<boolean> {
  const rows = inviteCheck(
    await db().from("invites").update({ revoked_at: now }).eq("id", id).is("used_at", null).is("revoked_at", null).select("id"),
  ) as unknown[] | null;
  return (rows?.length ?? 0) === 1;
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

// ---- Shared cars: one car, more than one user ----
// Each user who tracks a car has their own vehicles row for it (the car link). Its streamed readings are
// stored once per VIN, and each user reads them through their link (ownerDb readings).

// Of these VINs, the ones another user still tracks (their link is open). Delete my data and Disconnect
// leave those cars streaming: Tesla's streaming config is one per car, shared by everyone who tracks it.
export async function carsOthersTrack(owner: Owner, vins: string[]): Promise<Set<string>> {
  if (vins.length === 0) return new Set();
  const { data, error } = await db().from("vehicles").select("vin").in("vin", vins).neq("user_id", owner.userId).is("readings_until", null);
  if (error) throw new Error(`Reading shared cars failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.vin as string));
}

// Of these VINs, the ones no user tracks at all any more.
export async function untrackedCars(vins: string[]): Promise<string[]> {
  if (vins.length === 0) return [];
  const { data, error } = await db().from("vehicles").select("vin").in("vin", vins);
  if (error) throw new Error(`Reading shared cars failed: ${error.message}`);
  const tracked = new Set((data ?? []).map((r) => r.vin as string));
  return vins.filter((vin) => !tracked.has(vin));
}

// Rows per call: each call is its own short transaction (see the shared_cars migration).
const FORGET_BATCH = 5000;

// Deletes a car's readings that no user's link may see any more, a batch at a time: all of them once
// nobody tracks the car, otherwise only those outside every remaining user's window. Run after the
// leaving user's car rows are gone. Returns how many rows went.
export async function forgetUnseenReadings(vin: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { data, error } = await db().rpc("forget_unseen_readings", { p_vin: vin, p_limit: FORGET_BATCH });
    if (error) throw new Error(`Deleting readings failed: ${error.message}`);
    const n = typeof data === "number" ? data : 0;
    total += n;
    if (n < FORGET_BATCH) return total;
  }
}

// The retention run's sweep over every car: one batch of readings nobody may see.
export function pruneUnseenBatch(limit: number) {
  return db().rpc("prune_unseen_readings", { p_limit: limit });
}

// ---- The check lock (poll_runs) ----
// poll_runs allows one unfinished row per user (poll_runs_one_running_per_user_idx, from the api_usage
// migration): inserting one is taking the user's lock. Before that migration the index allows one for
// everyone, so a second user's check waits for the first (the cron checks users one after another).

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
export async function startRun(owner: Owner, uniqueViolation: string): Promise<number | null> {
  const { data, error } = await db().from("poll_runs").insert({ user_id: owner.userId }).select("id").single();
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

// True while a run holds the user's lock and isn't stale.
export async function runInProgress(owner: Owner, startedAfter: string): Promise<boolean> {
  const running = check(
    await db().from("poll_runs").select("id").eq("user_id", owner.userId).is("finished_at", null).gte("started_at", startedAfter).limit(1).maybeSingle(),
  );
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

// ---- Google Maps Platform calls, for Admin > Costs (google_usage) ----

// Adds one call to this month's count for the SKU. Never throws: an uncounted call is better than a
// failed lookup, and before the migration nothing is counted.
export async function countGoogleCall(sku: string): Promise<void> {
  try {
    const { error } = await db().rpc("increment_google_usage", { p_sku: sku, p_n: 1 });
    if (error && !["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code)) console.warn("Counting a Google call failed:", error.message);
  } catch (err) {
    console.warn("Counting a Google call failed:", (err as Error).message);
  }
}

// Each SKU's count for the month starting on `month` (YYYY-MM-01), or null before the migration.
export async function googleUsageFor(month: string): Promise<Record<string, number> | null> {
  const { data, error } = await db().from("google_usage").select("sku, count").eq("month", month);
  if (error) return null;
  return Object.fromEntries(((data ?? []) as { sku: string; count: number | string }[]).map((r) => [r.sku, Number(r.count)]));
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
    // Named key: the per-user one, (user_id, vehicle_id). Step 4 drops the vehicle_id-only one; until then
    // PostgREST sees two links between the tables and refuses an embed that doesn't say which.
    .select("car:id::text, user_id, version:current_version, snapshots!snapshots_user_vehicle_fkey(status:update_status, offered:update_version)")
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

export async function adminTotals(since: string, healthSince: string) {
  const [owners, vehicles, runs, failed, lastFailed, health] = await Promise.all([
    db().from("users").select("id", { count: "exact", head: true }).eq("status", APPROVED),
    db().from("vehicles").select("id:id::text, vin, current_version, last_seen_at, user_id"),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since),
    db().from("poll_runs").select("id", { count: "exact", head: true }).gte("started_at", since).eq("ok", false),
    db().from("poll_runs").select("started_at").eq("ok", false).gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db().rpc("health_daily", { since: healthSince }),
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

// Each tracked car's model and pack codes from its latest online check, by user id, for /admin. Few cars, so
// one small query each. A car never seen online has no codes yet and is left out.
export async function carCodes(): Promise<{ userId: number; config: { car_type?: string; trim_badging?: string } }[]> {
  const { data, error } = await db().from("vehicles").select("id, user_id").not("vin", "is", null).is("readings_until", null).order("user_id");
  if (error) throw new Error(`Reading cars failed: ${error.message}`);
  const cars = (data ?? []) as { id: string | number; user_id: number }[];
  const checks = await Promise.all(
    cars.map(async (car) => {
      const { data: row, error: rowError } = await db()
        .from("snapshots")
        .select("car_type:raw->vehicle_config->>car_type, trim_badging:raw->vehicle_config->>trim_badging")
        .eq("vehicle_id", car.id)
        .eq("state", "online")
        .not("raw->vehicle_config", "is", null)
        .order("polled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rowError) throw new Error(`Reading a car's last check failed: ${rowError.message}`);
      return row ? { userId: Number(car.user_id), config: row as { car_type?: string; trim_badging?: string } } : null;
    }),
  );
  return checks.filter((c) => c !== null);
}
