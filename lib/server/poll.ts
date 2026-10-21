import "server-only";
import { db } from "./supabase";
import { parseReleaseNotes } from "@/lib/release-notes";
import { fleetGet, TeslaError } from "./tesla";
import { syncChargingHistory } from "./charging";
import { syncStreamSessionsSafely } from "./stream-charging";
import { colorName, MILES_TO_KM, modelName } from "@/lib/car";
import { messageOf } from "@/lib/errors";

type FleetVehicle = {
  id: number;
  id_s: string; // same id as a string; `id` can exceed Number.MAX_SAFE_INTEGER
  vin: string;
  display_name: string | null;
  state: string; // "online" | "asleep" | "offline"
};

type SoftwareUpdate = {
  status?: string;
  version?: string;
  download_perc?: number;
  install_perc?: number;
  expected_duration_sec?: number;
  scheduled_time_ms?: number;
};

type VehicleData = {
  vehicle_state?: { car_version?: string; odometer?: number; software_update?: SoftwareUpdate };
  charge_state?: { battery_level?: number; battery_range?: number; charging_state?: string; charge_limit_soc?: number };
  vehicle_config?: { car_type?: string; exterior_color?: string; trim_badging?: string };
};

// The raw response is kept for /api/debug; token fields are never stored.
const TOKEN_KEYS = ["tokens", "backseat_token", "backseat_token_updated_at"];
function withoutTokens(data: VehicleData): Record<string, unknown> | null {
  if (!data) return null;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !TOKEN_KEYS.includes(key)));
}

// "2025.32.3 1a2b3c4d" -> "2025.32.3"; the build hash changes nothing for us.
export function normaliseVersion(version: string | null | undefined): string | null {
  const v = version?.trim().split(/\s+/)[0];
  return v && v !== "0.0.0" ? v : null;
}

async function check<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function pollVehicle(vehicle: FleetVehicle, now: string) {
  const id = vehicle.id_s;
  const existing = await check(
    db().from("vehicles").select("current_version").eq("id", id).maybeSingle(),
  );
  const base = {
    id,
    vin: vehicle.vin,
    display_name: vehicle.display_name,
    last_state: vehicle.state,
    last_polled_at: now,
    updated_at: now,
  };

  // Never wake the car: vehicle_data is only requested when it is already online.
  if (vehicle.state !== "online") {
    await check(db().from("vehicles").upsert(base));
    await check(db().from("snapshots").insert({ vehicle_id: id, polled_at: now, state: vehicle.state }));
    return;
  }

  let data: VehicleData;
  try {
    // The section list must be URL-encoded: with a bare ";" Tesla only returned vehicle_state.
    const endpoints = encodeURIComponent("vehicle_state;charge_state;vehicle_config");
    data = (await fleetGet<VehicleData>(`/api/1/vehicles/${vehicle.vin}/vehicle_data?endpoints=${endpoints}`)) ?? {};
  } catch (err) {
    // 408: the car fell asleep between the list call and this one.
    if (err instanceof TeslaError && err.status === 408) {
      await check(db().from("vehicles").upsert({ ...base, last_state: "asleep" }));
      await check(
        db().from("snapshots").insert({
          vehicle_id: id,
          polled_at: now,
          state: "asleep",
          error: "Vehicle unavailable (408)",
        }),
      );
      return;
    }
    throw err;
  }

  const state = data.vehicle_state ?? {};
  const update = state.software_update ?? {};
  const version = normaliseVersion(state.car_version);
  const previous = existing?.current_version ?? null;
  const charge = data.charge_state ?? {};
  const config = data.vehicle_config ?? {};

  // The history row goes in before the vehicle's current_version moves: if a later write fails,
  // the next check still sees the change instead of losing it.
  if (version && version !== previous) {
    // A retry after a failed later write would see the same change again; don't record it twice.
    const latest = await check(
      db()
        .from("version_history")
        .select("version")
        .eq("vehicle_id", id)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (latest?.version !== version) {
      // version_history references the vehicle, so a car seen for the first time needs its row first.
      if (!existing) await check(db().from("vehicles").upsert(base));
      // When was this version first offered to the car? Only meaningful for a real update, not the
      // version that was already installed when tracking began.
      const offered = previous
        ? await check(
            db()
              .from("snapshots")
              .select("polled_at")
              .eq("vehicle_id", id)
              .eq("update_version", version)
              .order("polled_at", { ascending: true })
              .limit(1)
              .maybeSingle(),
          )
        : null;
      await check(
        db().from("version_history").insert({
          vehicle_id: id,
          version,
          previous_version: previous,
          detected_at: now,
          available_at: offered?.polled_at ?? null,
          // Tesla reports the odometer in miles.
          odometer_km: typeof state.odometer === "number" ? Math.round(state.odometer * 1.609344 * 10) / 10 : null,
        }),
      );
    }
  }

  await check(
    db()
      .from("vehicles")
      .upsert({
        ...base,
        last_seen_at: now,
        ...(version ? { current_version: version } : {}),
        ...(config.car_type
          ? { model: modelName(config.car_type), exterior_color: colorName(config.exterior_color), trim_badging: config.trim_badging ?? null }
          : {}),
      }),
  );
  await check(
    db().from("snapshots").insert({
      vehicle_id: id,
      polled_at: now,
      state: "online",
      car_version: state.car_version ?? null,
      update_status: update.status || null,
      update_version: normaliseVersion(update.version),
      download_perc: update.download_perc ?? null,
      install_perc: update.install_perc ?? null,
      expected_duration_sec: update.expected_duration_sec ?? null,
      scheduled_time_ms: update.scheduled_time_ms ?? null,
      battery_level: charge.battery_level ?? null,
      battery_range_km: typeof charge.battery_range === "number" ? Math.round(charge.battery_range * MILES_TO_KM * 10) / 10 : null,
      charging_state: charge.charging_state ?? null,
      charge_limit: charge.charge_limit_soc ?? null,
      raw: withoutTokens(data),
    }),
  );
  await recordReleaseNotes(vehicle.vin, [
    { version, staged: false },
    { version: normaliseVersion(update.version), staged: true },
  ]);
}

// Fetch notes once per version, only while the car is already online (we never wake it).
// `staged=true` asks for the notes of a downloaded or pending update. Failures are logged, not fatal.
async function recordReleaseNotes(vin: string, versions: { version: string | null; staged: boolean }[]) {
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

export type PollResult = { ok: boolean; vehicles: number; error?: string; skipped?: boolean };

// A run that never finished (crash or timeout) stops holding the lock after this long.
const STALE_RUN_MS = 5 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

export async function pollAll(): Promise<PollResult> {
  await check(
    db()
      .from("poll_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: "Did not finish" })
      .is("finished_at", null)
      .lt("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString()),
  );
  // poll_runs allows one unfinished row (poll_runs_one_running_idx): inserting is taking the lock.
  const { data: run, error: lockError } = await db().from("poll_runs").insert({}).select("id").single();
  if (lockError?.code === UNIQUE_VIOLATION) return { ok: true, vehicles: 0, skipped: true };
  if (lockError || !run) throw new Error(lockError?.message ?? "Could not start a check");
  const now = new Date().toISOString();
  const errors: string[] = [];
  let vehicles: FleetVehicle[] = [];

  try {
    const listed = await fleetGet<FleetVehicle[]>("/api/1/vehicles");
    vehicles = Array.isArray(listed) ? listed : [];
    // Supercharger history is extra and can never fail the check; it touches its own table, so it
    // runs alongside the vehicles. Each car is polled on its own: one failing can't block another.
    const [results] = await Promise.all([
      Promise.allSettled(vehicles.map((vehicle) => pollVehicle(vehicle, now))),
      syncChargingHistory(vehicles.map((v) => v.vin)).catch((err) =>
        console.warn("Charging history sync failed:", messageOf(err)),
      ),
      // Sessions rebuilt from Fleet Telemetry (AC and third-party charging); logs its own failures.
      syncStreamSessionsSafely(vehicles.map((v) => v.vin)),
    ]);
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        errors.push(`${vehicles[i].display_name ?? vehicles[i].vin}: ${messageOf(result.reason)}`);
      }
    });
  } catch (err) {
    errors.push(messageOf(err));
  }

  const result: PollResult = { ok: errors.length === 0, vehicles: vehicles.length, error: errors.join("; ") || undefined };
  // The row is the lock: whatever happens to the full update, release it so the next check can run.
  try {
    await check(
      db()
        .from("poll_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: result.ok,
          vehicles_seen: result.vehicles,
          error: result.error ?? null,
        })
        .eq("id", run.id)
        .is("finished_at", null),
    );
  } catch (err) {
    await db()
      .from("poll_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: messageOf(err) })
      .eq("id", run.id)
      .is("finished_at", null);
    throw err;
  }
  return result;
}
