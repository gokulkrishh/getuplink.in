import "server-only";
import { db } from "./supabase";
import { parseReleaseNotes } from "@/lib/release-notes";
import { fleetGet } from "./tesla";
import { normaliseVersion } from "@/lib/versions";
import { messageOf } from "@/lib/errors";

// Writes shared by the poll and the streamed-version sync: both record a version change the same way.

export async function check<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// A run that never finished (crash or timeout) stops holding the lock after this long.
export const STALE_RUN_MS = 5 * 60 * 1000;
export const UNIQUE_VIOLATION = "23505";

// True while a poll holds the lock (poll_runs allows one unfinished row, see poll_runs_one_running_idx).
export async function pollInProgress(): Promise<boolean> {
  const running = await check(
    db()
      .from("poll_runs")
      .select("id")
      .is("finished_at", null)
      .gte("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString())
      .limit(1)
      .maybeSingle(),
  );
  return Boolean(running);
}

// The newest recorded version, so a retry after a failed later write doesn't record a change twice.
export async function latestRecordedVersion(vehicleId: string): Promise<string | null> {
  const latest = await check(
    db()
      .from("version_history")
      .select("version")
      .eq("vehicle_id", vehicleId)
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return latest?.version ?? null;
}

// When was this version first offered to the car? Only meaningful for a real update, not the
// version that was already installed when tracking began.
export async function offeredAt(vehicleId: string, version: string): Promise<string | null> {
  const offered = await check(
    db()
      .from("snapshots")
      .select("polled_at")
      .eq("vehicle_id", vehicleId)
      .eq("update_version", version)
      .order("polled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  );
  return offered?.polled_at ?? null;
}

export type NewVersion = {
  vehicleId: string;
  version: string;
  previous: string | null;
  detectedAt: string;
  availableAt: string | null;
  odometerKm: number | null;
};

// False when the same change was already recorded (unique vehicle_id + detected_at), e.g. by a concurrent sync.
export async function insertVersionChange(change: NewVersion): Promise<boolean> {
  const { error } = await db().from("version_history").insert({
    vehicle_id: change.vehicleId,
    version: change.version,
    previous_version: change.previous,
    detected_at: change.detectedAt,
    available_at: change.availableAt,
    odometer_km: change.odometerKm,
  });
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw new Error(error.message);
  return true;
}

// Fetch notes once per version, only while the car is already online (we never wake it).
// `staged=true` asks for the notes of a downloaded or pending update. Failures are logged, not fatal.
export async function recordReleaseNotes(vin: string, versions: { version: string | null; staged: boolean }[]) {
  const wanted = versions.filter((v): v is { version: string; staged: boolean } => Boolean(v.version));
  if (wanted.length === 0) return;
  const { data: stored } = await db()
    .from("release_notes")
    .select("version")
    .in(
      "version",
      wanted.map((v) => v.version),
    );
  const have = new Set((stored ?? []).map((r: { version: string }) => r.version));

  for (const { version, staged } of wanted) {
    if (have.has(version)) continue;
    try {
      const raw = await fleetGet<Record<string, unknown>>(`/api/1/vehicles/${vin}/release_notes${staged ? "?staged=true" : ""}`);
      if (!raw) continue;
      const reported = normaliseVersion(String((staged ? raw?.staged_version : raw?.deployed_version) ?? ""));
      // Don't file notes under the wrong version if Tesla answers for a different one.
      if (reported && reported !== version) continue;
      const notes = parseReleaseNotes(raw);
      if (notes.length === 0) continue;
      await check(db().from("release_notes").upsert({ version, notes, raw }, { onConflict: "version", ignoreDuplicates: true }));
    } catch (err) {
      console.warn(`Release notes for ${version} unavailable:`, messageOf(err));
    }
  }
}
