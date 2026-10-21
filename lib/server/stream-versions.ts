import "server-only";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";
import { loadReadings, loadStream } from "./telemetry";
import { check, insertVersionChange, latestRecordedVersion, offeredAt, pollInProgress, recordReleaseNotes } from "./version-history";
import { firstOffered, milesToKm, nearestNumber, versionChanges } from "@/lib/versions";
import { messageOf } from "@/lib/errors";

const DAY = 24 * 60 * 60 * 1000;
// Release notes are only fetched while the car is awake, so the call can't be what wakes it.
const AWAKE_MS = 10 * 60 * 1000;

// Records the version changes the car streamed, the way the poll records the ones it sees: a
// version_history row (with when it was offered and the odometer), then the vehicle's current version,
// then the release notes. Safe to run any number of times: a change already in the history is skipped,
// and (vehicle, detected_at) is unique, so two syncs can't record the same streamed change twice.
// A running poll is left to finish (it syncs the stream itself at the end), unless `lockHeld` says the
// caller is that poll.
export async function syncStreamVersions(vin: string, { lockHeld = false }: { lockHeld?: boolean } = {}): Promise<void> {
  if (DEMO) return;
  if (!lockHeld && (await pollInProgress())) return;
  const vehicle = await check(db().from("vehicles").select("id:id::text, current_version").eq("vin", vin).maybeSingle());
  if (!vehicle) return;
  const id = vehicle.id as string;

  const latest = await check(
    db().from("version_history").select("detected_at").eq("vehicle_id", id).order("detected_at", { ascending: false }).limit(1).maybeSingle(),
  );
  const since = (latest?.detected_at as string | undefined) ?? new Date(0).toISOString();
  const readings = await loadReadings(vin, "Version", since);
  if (!readings) return;
  const steps = versionChanges(readings, (vehicle.current_version as string | null) ?? null);
  if (steps.length === 0) return;

  let recorded = false;
  for (const step of steps) {
    // A retry after a failed later write would see the same change again; don't record it twice.
    if ((await latestRecordedVersion(id)) === step.version) continue;
    const [pending, odometer] = await Promise.all([
      // The offer comes before the install; look back two weeks, like the dashboard's update timings.
      loadReadings(vin, "SoftwareUpdateVersion", new Date(Date.parse(step.at) - 14 * DAY).toISOString(), step.at),
      loadReadings(vin, "Odometer", new Date(Date.parse(step.at) - DAY).toISOString(), new Date(Date.parse(step.at) + DAY).toISOString()),
    ]);
    const offered = (pending ? firstOffered(pending, step.version, step.at) : null) ?? (step.previous ? await offeredAt(id, step.version) : null);
    const miles = odometer ? nearestNumber(odometer, step.at, DAY) : null;
    const inserted = await insertVersionChange({
      vehicleId: id,
      version: step.version,
      previous: step.previous,
      detectedAt: step.at,
      availableAt: offered,
      odometerKm: miles === null ? null : milesToKm(miles),
    });
    recorded ||= inserted;
  }

  // The history row goes in before the vehicle's version moves, so a failed write here is retried.
  const newest = steps[steps.length - 1].version;
  await check(db().from("vehicles").update({ current_version: newest, updated_at: new Date().toISOString() }).eq("id", id));

  if (recorded && (await isAwake(vin))) await recordReleaseNotes(vin, [{ version: newest, staged: false }]);
}

async function isAwake(vin: string): Promise<boolean> {
  const stream = await loadStream(vin);
  const newest = Math.max(0, ...Object.values(stream).map((r) => Date.parse(r.at)));
  return Date.now() - newest < AWAKE_MS;
}

// Best effort for callers that must never fail on it (the poll, the dashboard).
export async function syncStreamVersionsSafely(vins: (string | null | undefined)[], options?: { lockHeld?: boolean }): Promise<void> {
  for (const vin of new Set(vins.filter((v): v is string => Boolean(v)))) {
    try {
      await syncStreamVersions(vin, options);
    } catch (err) {
      console.warn(`Streamed versions unavailable for ${vin}:`, messageOf(err));
    }
  }
}

export async function syncStreamVersionsForAllCars(): Promise<void> {
  if (DEMO) return;
  const { data, error } = await db().from("vehicles").select("vin");
  if (error) {
    console.warn("Streamed versions unavailable:", error.message);
    return;
  }
  await syncStreamVersionsSafely((data ?? []).map((v) => v.vin as string | null));
}
