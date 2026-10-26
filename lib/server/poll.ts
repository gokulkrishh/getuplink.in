import "server-only";
import { DEMO } from "@/lib/demo";
import { type Owner, ownerDb } from "./data/owner";
import { accountOwners, closeStaleRuns, finishRun, startRun } from "./data/system";
import { fleetGet, hasScope, LOCATION_SCOPE, NotConnectedError, TeslaError } from "./tesla";
import { syncChargingHistory } from "./charging";
import { syncStreamSessionsSafely } from "./stream-charging";
import { syncStreamVersionsSafely } from "./stream-versions";
import {
  check,
  insertVersionChange,
  latestRecordedVersion,
  offeredAt,
  recordReleaseNotes,
  STALE_RUN_MS,
  UNIQUE_VIOLATION,
} from "./version-history";
import { milesToKm, normaliseVersion } from "@/lib/versions";
import { storedRaw } from "@/lib/stored-raw";
import { colorName, MILES_TO_KM, modelName } from "@/lib/car";
import { messageOf } from "@/lib/errors";
import { mostCommonState } from "@/lib/india-states";
import { stateAt } from "@/lib/india-map";

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
  // Only with the location scope. Never stored: see homeStateFrom.
  drive_state?: { latitude?: number; longitude?: number; native_latitude?: number; native_longitude?: number };
};

// How many located checks decide a car's home state (the column's check allows up to this many).
const RECENT_STATES = 30;

// A car row is the owner's copy of the car: the upsert matches on (user_id, id), never on the id alone,
// so it can't take over another user's row. Until step 4 makes that the key, another user's copy of the
// same car is refused (the old id key).
const CAR_KEY = { onConflict: "user_id,id" };

// The state the car is in now, from drive_state, which is then dropped from `data`: the coordinates are
// never stored, logged or passed on. Null when Tesla sent no location or it is outside India.
function homeStateFrom(data: VehicleData): string | null {
  const drive = data.drive_state;
  delete data.drive_state;
  const lat = drive?.latitude ?? drive?.native_latitude;
  const lon = drive?.longitude ?? drive?.native_longitude;
  return typeof lat === "number" && typeof lon === "number" ? stateAt(lat, lon) : null;
}

// Adds this check's state to the car's recent ones and moves home_state to the most common. Separate from
// the vehicle upsert, so a database without the columns yet only loses the state. The message is fixed:
// nothing about the car's location reaches the log.
async function recordState(owner: Owner, id: string, state: string) {
  try {
    const row = await check(ownerDb(owner).from("vehicles").select("recent_states").eq("id", id).maybeSingle());
    const recent = [...((row?.recent_states as string[] | null) ?? []), state].slice(-RECENT_STATES);
    await check(ownerDb(owner).from("vehicles").update({ recent_states: recent, home_state: mostCommonState(recent) }).eq("id", id));
  } catch {
    console.warn("Saving the home state failed");
  }
}

async function pollVehicle(owner: Owner, vehicle: FleetVehicle, now: string, located: boolean) {
  const id = vehicle.id_s;
  const scope = ownerDb(owner);
  const existing = await check(
    scope.from("vehicles").select("current_version").eq("id", id).maybeSingle(),
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
    await check(scope.from("vehicles").upsert(base, CAR_KEY));
    await check(scope.from("snapshots").insert({ vehicle_id: id, polled_at: now, state: vehicle.state }));
    return;
  }

  let data: VehicleData;
  try {
    // The section list must be URL-encoded: with a bare ";" Tesla only returned vehicle_state. Current
    // firmware sends drive_state's latitude and longitude only when location_data is asked for too, and
    // drive_state itself has to be in the list.
    const read = (sections: string) =>
      fleetGet<VehicleData>(owner, `/api/1/vehicles/${vehicle.vin}/vehicle_data?endpoints=${encodeURIComponent(sections)}`);
    const sections = "vehicle_state;charge_state;vehicle_config";
    try {
      data = (await read(located ? `${sections};drive_state;location_data` : sections)) ?? {};
    } catch (err) {
      // A 403 for the location sections (scope withdrawn in the app) mustn't cost the rest of the check.
      if (!(located && err instanceof TeslaError && err.status === 403)) throw err;
      data = (await read(sections)) ?? {};
    }
  } catch (err) {
    // 408: the car fell asleep between the list call and this one.
    if (err instanceof TeslaError && err.status === 408) {
      await check(scope.from("vehicles").upsert({ ...base, last_state: "asleep" }, CAR_KEY));
      await check(
        scope.from("snapshots").insert({
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

  const hadLocation = typeof (data.drive_state?.latitude ?? data.drive_state?.native_latitude) === "number";
  const homeState = homeStateFrom(data);
  // Yes/no only, so a missing state can be traced; never the coordinates or the state.
  if (located) console.info(`Location: ${hadLocation ? "received" : "not sent"}, state ${homeState ? "found" : "not found"}`);
  else console.info("Location: not asked (the Tesla token has no vehicle_location scope)");
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
    if ((await latestRecordedVersion(owner, id)) !== version) {
      // version_history references the vehicle, so a car seen for the first time needs its row first.
      if (!existing) await check(scope.from("vehicles").upsert(base, CAR_KEY));
      await insertVersionChange(owner, {
        vehicleId: id,
        version,
        previous,
        detectedAt: now,
        availableAt: previous ? await offeredAt(owner, id, version) : null,
        odometerKm: typeof state.odometer === "number" ? milesToKm(state.odometer) : null,
      });
    }
  }

  await check(
    scope
      .from("vehicles")
      .upsert({
        ...base,
        last_seen_at: now,
        ...(version ? { current_version: version } : {}),
        ...(config.car_type
          ? { model: modelName(config.car_type), exterior_color: colorName(config.exterior_color), trim_badging: config.trim_badging ?? null }
          : {}),
      }, CAR_KEY),
  );
  await check(
    scope.from("snapshots").insert({
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
      // Kept for /api/debug, without tokens, location or media_info (see storedRaw).
      raw: storedRaw(data),
    }),
  );
  if (homeState) await recordState(owner, id, homeState);
  await recordReleaseNotes(owner, vehicle.vin, [
    { version, staged: false },
    { version: normaliseVersion(update.version), staged: true },
  ]);
}

export type PollResult = { ok: boolean; vehicles: number; error?: string; skipped?: boolean };

export async function pollAll(): Promise<PollResult> {
  if (DEMO) return { ok: true, vehicles: 0, skipped: true };
  await closeStaleRuns(new Date(Date.now() - STALE_RUN_MS).toISOString());
  // poll_runs allows one unfinished row (poll_runs_one_running_idx): inserting is taking the lock.
  const run = await startRun(UNIQUE_VIOLATION);
  if (run === null) return { ok: true, vehicles: 0, skipped: true };
  const now = new Date().toISOString();
  const errors: string[] = [];
  let vehicles = 0;

  try {
    const owners = await accountOwners();
    // No account yet fails the check the way a missing token does.
    if (owners.length === 0) throw new NotConnectedError();
    // One account after another, each with its own token; one failing can't stop the next.
    for (const owner of owners) {
      try {
        vehicles += await pollOwner(owner, now, errors);
      } catch (err) {
        errors.push(messageOf(err));
      }
    }
  } catch (err) {
    errors.push(messageOf(err));
  }

  const result: PollResult = { ok: errors.length === 0, vehicles, error: errors.join("; ") || undefined };
  // The row is the lock: whatever happens to the full update, release it so the next check can run.
  try {
    await finishRun(run, { ok: result.ok, vehicles_seen: result.vehicles, error: result.error ?? null });
  } catch (err) {
    await finishRun(run, { ok: false, error: messageOf(err) }).catch(() => {});
    throw err;
  }
  return result;
}

// One account's check: every car on its Tesla account. Errors per car go to `errors`; returns how many
// cars Tesla listed.
async function pollOwner(owner: Owner, now: string, errors: string[]): Promise<number> {
  const listed = await fleetGet<FleetVehicle[]>(owner, "/api/1/vehicles");
  const vehicles = Array.isArray(listed) ? listed : [];
  // Location is read only with the scope (granted at a sign-in since it was added), and only when the
  // car is already online for the check: never a wake.
  const located = await hasScope(owner, LOCATION_SCOPE).catch(() => false);
  // Supercharger history is extra and can never fail the check; it touches its own table, so it
  // runs alongside the vehicles. Each car is polled on its own: one failing can't block another.
  // The check holds the lock, so it is where a car's one-time full history read happens.
  const [results] = await Promise.all([
    Promise.allSettled(vehicles.map((vehicle) => pollVehicle(owner, vehicle, now, located))),
    syncChargingHistory(
      owner,
      vehicles.map((v) => v.vin),
      { backfill: true },
    ).catch((err) =>
      console.warn("Charging history sync failed:", messageOf(err)),
    ),
    // Sessions rebuilt from Fleet Telemetry (AC and third-party charging); logs its own failures.
    syncStreamSessionsSafely(owner, vehicles.map((v) => v.vin)),
  ]);
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      errors.push(`${vehicles[i].display_name ?? vehicles[i].vin}: ${messageOf(result.reason)}`);
    }
  });
  // Versions the stream saw while the car was asleep for the poll. The poll holds the lock, so the
  // sync skips its own lock check; it logs its own failures.
  await syncStreamVersionsSafely(
    owner,
    vehicles.map((v) => v.vin),
    { lockHeld: true },
  );
  return vehicles.length;
}
