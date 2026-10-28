import "server-only";
import { readAllRows } from "@/lib/paging";
import { db } from "@/lib/server/supabase";
import { asOwner, type Owner } from "./owner";
import { APPROVED } from "./system";
import { MissingSchema } from "./usage";

// The Owners page's fleet-wide reads and writes (20261110120000_owners_sharing.sql): who shares, every shared
// car's day rows for the daily run, and the published totals. The day rows only ever leave the run reduced
// to totals (lib/owners.ts aggregate). One owner's own rows go through ownerDb (fleet_car_days is an owner
// table). Before the migration each of these throws MissingSchema, and the callers carry on without sharing.

const MISSING = ["42P01", "PGRST205", "42703", "PGRST204"];

function fail(error: { code?: string; message: string }): never {
  if (error.code && MISSING.includes(error.code)) throw new MissingSchema(error.message);
  throw new Error(error.message);
}

export type Sharing = { on: boolean; since: string | null };

export async function sharingOf(owner: Owner): Promise<Sharing> {
  const { data, error } = await db().from("users").select("share_with_owners, shared_since").eq("id", owner.userId).maybeSingle();
  if (error) fail(error);
  return { on: data?.share_with_owners === true, since: (data?.shared_since as string | null | undefined) ?? null };
}

// On records when; off clears it. The caller deletes the day rows.
export async function setSharingFlag(owner: Owner, on: boolean, at: string): Promise<void> {
  const { error } = await db()
    .from("users")
    .update({ share_with_owners: on, shared_since: on ? at : null, updated_at: at })
    .eq("id", owner.userId);
  if (error) fail(error);
}

// Every approved account that shares, by id.
export async function sharingOwners(): Promise<Owner[]> {
  const { data, error } = await db().from("users").select("id, tesla_sub").eq("status", APPROVED).eq("share_with_owners", true).order("id");
  if (error) fail(error);
  return (data ?? []).map((u) => asOwner(Number(u.id), u.tesla_sub as string));
}

export type SharedDayRow = { user_id: number; vehicle_id: string; vin_hash: string; day: string; figures: unknown };

// The day rows of these accounts from `fromDay` (an IST date) on, for the totals.
export async function sharedCarDays(userIds: number[], fromDay: string): Promise<SharedDayRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await readAllRows((from, to) =>
    db()
      .from("fleet_car_days")
      .select("user_id, vehicle_id:vehicle_id::text, vin_hash, day, figures")
      .in("user_id", userIds)
      .gte("day", fromDay)
      .order("user_id")
      .order("vehicle_id")
      .order("day")
      .range(from, to),
  );
  if (error) fail(error);
  return (data as Record<string, unknown>[]).map((r) => ({ ...(r as SharedDayRow), user_id: Number(r.user_id) }));
}

// Day rows past the keep, and any of an account that no longer shares (turning sharing off deletes them at
// once; this catches one that failed halfway).
export async function pruneSharedDays(beforeDay: string, sharing: number[]): Promise<void> {
  const old = await db().from("fleet_car_days").delete().lt("day", beforeDay);
  if (old.error) fail(old.error);
  const query = db().from("fleet_car_days").delete();
  const gone = await (sharing.length ? query.not("user_id", "in", `(${sharing.join(",")})`) : query.gte("day", "1970-01-01"));
  if (gone.error) fail(gone.error);
}

export type StatsRow = { computed_at: string; cars: number; stats: unknown };

export async function latestOwnerStats(): Promise<StatsRow | null> {
  const { data, error } = await db().from("fleet_stats").select("computed_at, cars, stats").order("computed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) fail(error);
  return data ? { computed_at: data.computed_at as string, cars: Number(data.cars), stats: data.stats } : null;
}

export async function saveOwnerStats(row: StatsRow): Promise<void> {
  const { error } = await db().from("fleet_stats").insert(row);
  if (error) fail(error);
}

export async function pruneOwnerStats(before: string): Promise<void> {
  const { error } = await db().from("fleet_stats").delete().lt("computed_at", before);
  if (error) fail(error);
}
