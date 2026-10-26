import "server-only";
import { db } from "@/lib/server/supabase";
import type { Owner } from "./owner";

// Tesla Fleet API usage (api_usage, telemetry_signal_days) and each user's check schedule (users'
// next_check_at, check_lock_until, check_now_at), all from supabase/migrations/20261101120000_api_usage.sql.
// Before that migration is applied, each of these says so with MissingSchema instead of failing, and the
// callers carry on as before (lib/server/usage.ts, lib/server/poll.ts).

// Missing table, function or column, as Postgres or PostgREST reports them.
const MISSING = ["42P01", "PGRST205", "PGRST202", "42883", "42703", "PGRST204"];

export class MissingSchema extends Error {}

function fail(error: { code?: string; message: string }): never {
  if (error.code && MISSING.includes(error.code)) throw new MissingSchema(error.message);
  throw new Error(error.message);
}

// The user requests are counted under when there is no approved account yet (a sign-up's region check).
export const UNATTRIBUTED = 0;

export async function incrementApiUsage(userId: number, kind: string, n = 1): Promise<void> {
  const { error } = await db().rpc("increment_api_usage", { p_user_id: userId, p_kind: kind, p_n: n });
  if (error) fail(error);
}

// Delete account: the user's counts move to UNATTRIBUTED, so the developer account's month keeps them.
export async function foldApiUsage(owner: Owner): Promise<void> {
  const { error } = await db().rpc("fold_api_usage", { p_user_id: owner.userId });
  if (error) fail(error);
}

export type UsageRow = { user_id: number; kind: string; count: number };

// Every user's counts for one month ("2026-10-01").
export async function monthUsage(month: string): Promise<UsageRow[]> {
  const { data, error } = await db().from("api_usage").select("user_id, kind, count").eq("month", month);
  if (error) fail(error);
  return (data ?? []).map((r) => ({ user_id: Number(r.user_id), kind: String(r.kind), count: Number(r.count) }));
}

export type SignalDay = { vin: string; signals: number };

// Every VIN's streamed signals on the days from `fromDay` up to, not including, `toDay`.
export async function signalDays(fromDay: string, toDay: string): Promise<SignalDay[]> {
  const { data, error } = await db().from("telemetry_signal_days").select("vin, signals").gte("day", fromDay).lt("day", toDay);
  if (error) fail(error);
  return (data ?? []).map((r) => ({ vin: String(r.vin), signals: Number(r.signals) }));
}

// The daily recount (see the migration). Returns the (vin, day) rows written.
export async function countTelemetrySignals(days: number): Promise<number> {
  const { data, error } = await db().rpc("count_telemetry_signals", { p_days: days });
  if (error) fail(error);
  return typeof data === "number" ? data : 0;
}

// Which user's cars each VIN is, for a user's share of the signals. A car two users track goes to the lower
// user id, as the fleet totals count it (oneCopyPerCar).
export async function vinUsers(): Promise<Map<string, number>> {
  const { data, error } = await db().from("vehicles").select("vin, user_id").not("vin", "is", null);
  if (error) throw new Error(error.message);
  const out = new Map<string, number>();
  for (const r of data ?? []) {
    const vin = String(r.vin);
    const user = Number(r.user_id);
    const kept = out.get(vin);
    if (kept === undefined || user < kept) out.set(vin, user);
  }
  return out;
}

// ---- Tesla answers reused for a while (tesla_answer_cache) ----

export type CachedAnswer = { vin: string; body: unknown; fetched_at: string };

// The stored answer under `name`, or null. Throws MissingSchema before the migration.
export async function cachedAnswer(name: string): Promise<CachedAnswer | null> {
  const { data, error } = await db().from("tesla_answer_cache").select("vin, body, fetched_at").eq("name", name).maybeSingle();
  if (error) fail(error);
  return data ? { vin: String(data.vin), body: data.body, fetched_at: String(data.fetched_at) } : null;
}

// Stored under the user whose token asked, so their Delete my data removes it.
export async function saveAnswer(owner: Owner, name: string, vin: string, body: unknown, fetchedAt: string): Promise<void> {
  const { error } = await db()
    .from("tesla_answer_cache")
    .upsert({ name, user_id: owner.userId, vin, body, fetched_at: fetchedAt }, { onConflict: "name" });
  if (error) fail(error);
}

// Delete my data: every answer stored for this user's cars.
export async function forgetAnswers(owner: Owner): Promise<void> {
  const { error } = await db().from("tesla_answer_cache").delete().eq("user_id", owner.userId);
  if (error) fail(error);
}

// ---- Each user's check schedule ----

export type Schedule = { id: number; next_check_at: string | null; check_lock_until: string | null };

// Every approved user's schedule. Throws MissingSchema before the migration.
export async function schedules(): Promise<Schedule[]> {
  const { data, error } = await db().from("users").select("id, next_check_at, check_lock_until").eq("status", "approved");
  if (error) fail(error);
  return (data ?? []).map((r) => ({ id: Number(r.id), next_check_at: r.next_check_at ?? null, check_lock_until: r.check_lock_until ?? null }));
}

// Takes the user for a scheduled check: only while they are still due and nobody holds them. Moves
// next_check_at on in the same update, so a second cron run can't take them too. True when taken.
export async function claimScheduledCheck(userId: number, now: string, nextAt: string, lockUntil: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_scheduled_check", { p_user_id: userId, p_now: now, p_next_at: nextAt, p_lock_until: lockUntil });
  if (error) fail(error);
  return data === true;
}

// Takes the user for an on-demand check: nobody holds them, and their last one started before `since`.
export async function claimCheckNow(userId: number, now: string, since: string, nextAt: string, lockUntil: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_check_now", { p_user_id: userId, p_now: now, p_since: since, p_next_at: nextAt, p_lock_until: lockUntil });
  if (error) fail(error);
  return data === true;
}

// Delete my data: the cars' streamed-signal days lose their VINs (folded into a VIN-less row per day, so
// the month's total stays). Throws MissingSchema before the migration.
export async function foldSignalDays(vins: string[]): Promise<void> {
  if (vins.length === 0) return;
  const { error } = await db().rpc("fold_signal_days", { p_vins: vins });
  if (error) fail(error);
}

// Lets the user go after a check. `nextAt` puts them back as due (their check couldn't run).
export async function releaseCheck(userId: number, nextAt?: string): Promise<void> {
  const { error } = await db()
    .from("users")
    .update({ check_lock_until: null, ...(nextAt ? { next_check_at: nextAt } : {}) })
    .eq("id", userId);
  if (error) fail(error);
}

// Before the migration: when the newest check of anyone started, so the 15-minute cron still checks only
// every 6 hours.
export async function lastRunStartedAt(): Promise<string | null> {
  const { data, error } = await db().from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.started_at as string | undefined) ?? null;
}
