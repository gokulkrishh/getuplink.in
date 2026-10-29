import "server-only";
import type { CarSetup, Streaming } from "@/lib/setup-status";
import { db } from "@/lib/server/supabase";
import { type Owner, ownerDb } from "./owner";

// Each car's setup status (supabase/migrations/20261103120000_car_setup.sql): Uplink's key on the car and
// its streaming, as Tesla last said. Before that migration the columns don't exist: reads and writes throw
// SetupSchemaMissing, and lib/server/setup.ts carries on without storing anything (and without the gate).

const MISSING_COLUMN = ["42703", "PGRST204"];

export class SetupSchemaMissing extends Error {}

function fail(error: { code?: string; message: string }): never {
  if (error.code && MISSING_COLUMN.includes(error.code)) throw new SetupSchemaMissing(error.message);
  throw new Error(error.message);
}

type Row = {
  vin: string;
  display_name: string | null;
  key_paired?: boolean | null;
  key_checked_at?: string | null;
  streaming?: string | null;
  streaming_checked_at?: string | null;
  telemetry_config_sent_at?: string | null;
};

const STREAMING = new Set(["synced", "pending", "none", "full"]);

const toCar = (r: Row): CarSetup => ({
  vin: r.vin,
  name: r.display_name ?? null,
  keyPaired: r.key_paired ?? null,
  keyCheckedAt: r.key_checked_at ?? null,
  streaming: r.streaming && STREAMING.has(r.streaming) ? (r.streaming as Streaming) : null,
  streamingCheckedAt: r.streaming_checked_at ?? null,
  configSentAt: r.telemetry_config_sent_at ?? null,
});

// The owner's cars still on their Tesla account (readings_until is null), with their stored status.
export async function carSetups(owner: Owner): Promise<CarSetup[]> {
  const { data, error } = await ownerDb(owner)
    .from("vehicles")
    .select("vin, display_name, key_paired, key_checked_at, streaming, streaming_checked_at, telemetry_config_sent_at")
    .not("vin", "is", null)
    .is("readings_until", null)
    .order("vin");
  if (error) fail(error);
  return ((data ?? []) as Row[]).map(toCar);
}

// The same cars with nothing stored, for before the migration.
export async function carsWithoutSetup(owner: Owner): Promise<CarSetup[]> {
  const { data, error } = await ownerDb(owner).from("vehicles").select("vin, display_name").not("vin", "is", null).is("readings_until", null).order("vin");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toCar);
}

// Only an answer at least as new as the stored one replaces it: the health check stores Tesla's answer from up to
// an hour before (lib/server/tesla-stream-state.ts), which must not undo what /setup just heard. A car
// without the key streams nothing, so a removal also drops the streaming answer, to be asked again.
export async function saveKeyStatus(owner: Owner, vin: string, paired: boolean | null, at: string): Promise<void> {
  const patch = paired === false ? { key_paired: false, key_checked_at: at, streaming: null, streaming_checked_at: null } : { key_paired: paired, key_checked_at: at };
  const { error } = await ownerDb(owner).from("vehicles").update(patch).eq("vin", vin).or(`key_checked_at.is.null,key_checked_at.lte.${at}`);
  if (error) fail(error);
}

export async function saveStreaming(owner: Owner, vin: string, streaming: Streaming | null, at: string): Promise<void> {
  const { error } = await ownerDb(owner).from("vehicles").update({ streaming, streaming_checked_at: at }).eq("vin", vin);
  if (error) fail(error);
}

// The health check's word on a car's config (lib/server/stream-health.ts), from Tesla's answer of up to an
// hour before: kept only when nothing newer is stored, as saveKeyStatus does, so it never undoes /setup.
export async function saveStreamingIfNewer(owner: Owner, vin: string, streaming: Streaming, at: string): Promise<void> {
  const { error } = await ownerDb(owner)
    .from("vehicles")
    .update({ streaming, streaming_checked_at: at })
    .eq("vin", vin)
    .or(`streaming_checked_at.is.null,streaming_checked_at.lte.${at}`);
  if (error) fail(error);
}

export async function markConfigSent(owner: Owner, vin: string, at: string): Promise<void> {
  const { error } = await ownerDb(owner).from("vehicles").update({ telemetry_config_sent_at: at }).eq("vin", vin);
  if (error) fail(error);
}

// ---- When each car's streaming config runs out (20261113120000_config_expiry.sql) ----
// Kept apart from the reads and writes above, so before that migration only the warning is missing: these
// throw SetupSchemaMissing, which their callers leave out quietly.

// The owner's cars' config expiry by VIN; a car with nothing stored is left out.
export async function configExpiries(owner: Owner): Promise<Map<string, string>> {
  const { data, error } = await ownerDb(owner).from("vehicles").select("vin, telemetry_config_expires_at").not("vin", "is", null).not("telemetry_config_expires_at", "is", null);
  if (error) fail(error);
  return new Map(((data ?? []) as { vin: string; telemetry_config_expires_at: string }[]).map((r) => [r.vin, r.telemetry_config_expires_at]));
}

// `olderThan`: the health check's answer can be up to an hour old, so it is kept only when /setup hasn't
// read the car's config since (streaming_checked_at). /setup's own fresh answer is always kept.
export async function saveConfigExpiry(owner: Owner, vin: string, expiresAt: string | null, olderThan?: string): Promise<void> {
  let query = ownerDb(owner).from("vehicles").update({ telemetry_config_expires_at: expiresAt }).eq("vin", vin);
  if (olderThan) query = query.or(`streaming_checked_at.is.null,streaming_checked_at.lte.${olderThan}`);
  const { error } = await query;
  if (error) fail(error);
}

// ---- Fleet-wide, for /admin ----

export type WaitingCar = { userId: number; keyPaired: boolean | null; streaming: Streaming | null; checkedAt: string | null; sentAt: string | null };

// Cars on their owner's account that don't stream to Uplink yet, as Tesla last said: no VINs or names.
// Null before the migration.
export async function carsNotStreaming(): Promise<WaitingCar[] | null> {
  const { data, error } = await db()
    .from("vehicles")
    .select("user_id, key_paired, streaming, key_checked_at, streaming_checked_at, telemetry_config_sent_at")
    .not("vin", "is", null)
    .is("readings_until", null)
    .or("streaming.is.null,streaming.neq.synced")
    .order("user_id");
  if (error) {
    if (error.code && MISSING_COLUMN.includes(error.code)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as (Row & { user_id: number })[]).map((r) => {
    const car = toCar(r);
    return {
      userId: Number(r.user_id),
      keyPaired: car.keyPaired,
      streaming: car.streaming,
      checkedAt: car.streamingCheckedAt ?? car.keyCheckedAt,
      sentAt: car.configSentAt,
    };
  });
}
