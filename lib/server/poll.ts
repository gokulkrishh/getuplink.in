import "server-only";
import { DEMO } from "@/lib/demo";
import { type Owner, ownerDb } from "./data/owner";
import { accountOwners, closeStaleRuns, finishRun, startRun } from "./data/system";
import { claimCheckNow, claimScheduledCheck, lastRunStartedAt, MissingSchema, releaseCheck, type Schedule, schedules } from "./data/usage";
import { checkSetup } from "./setup";
import { budgetState } from "./usage";
import { CHECK_EVERY_MS } from "@/lib/tesla-billing";
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

// A car row is the owner's copy of the car, and their link to its streamed readings: the upsert matches
// on (user_id, id), its key, never on the id alone, so it can't take over another user's row. It never
// sends readings_from, readings_until or missing_since, so a check can't move the owner's window (see
// syncWindows).
const CAR_KEY = { onConflict: "user_id,id" };

// How long a car must be missing from the owner's Tesla vehicle list before it counts as gone (sold, or a
// shared car's access removed). One list that leaves a car out must never close its window: reopening it
// starts from then, so everything before would be hidden from the owner and then deleted as nobody's.
export const GONE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// The owner's window on each car's streamed readings (vehicles.readings_from .. readings_until, read
// through ownerDb readings), from the cars Tesla lists for them now:
//   * a car not listed is marked missing_since (the first such check);
//   * one missing for GONE_AFTER_MS closes at missing_since, so the owner doesn't see what it streams for
//     its next owner;
//   * one listed again clears the mark, its window untouched; after a close, it opens a new window from
//     now (bought back): the time it was someone else's stays hidden.
// A new car opens on insert (the column's default). Best effort: a failure leaves the windows as they were.
export async function syncWindows(owner: Owner, listedIds: string[], now: string) {
  const scope = ownerDb(owner);
  const ids = `(${listedIds.map((id) => `"${id}"`).join(",")})`;
  try {
    let missing = scope.from("vehicles").update({ missing_since: now }).is("readings_until", null).is("missing_since", null);
    if (listedIds.length) missing = missing.not("id", "in", ids);
    await check(missing);

    let gone = scope.from("vehicles").select("id:id::text, missing_since").is("readings_until", null).lte("missing_since", new Date(Date.parse(now) - GONE_AFTER_MS).toISOString());
    if (listedIds.length) gone = gone.not("id", "in", ids);
    for (const car of (await check(gone)) ?? []) {
      await check(scope.from("vehicles").update({ readings_until: car.missing_since }).eq("id", car.id).is("readings_until", null));
    }

    if (listedIds.length) {
      await check(scope.from("vehicles").update({ missing_since: null }).in("id", listedIds).is("readings_until", null).not("missing_since", "is", null));
      await check(
        scope.from("vehicles").update({ readings_from: now, readings_until: null, missing_since: null }).in("id", listedIds).not("readings_until", "is", null),
      );
    }
  } catch (err) {
    console.warn("Updating the cars' reading windows failed:", messageOf(err));
  }
}

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

export type PollResult = { ok: boolean; vehicles: number; users?: number; error?: string; skipped?: string };

// How many users one cron run checks, one after another, and when it stops starting another: the route
// has 60 s (maxDuration). Users not reached stay due for the next run, 15 minutes later.
export const BATCH = 4;
const RUN_BUDGET_MS = 40_000;
// A user's lock outlives a check that crashed by this long, then frees itself.
const LOCK_MS = 2 * 60_000;
// The on-demand check (after a sign-in) runs at most this often per user.
export const CHECK_NOW_GAP_MS = 5 * 60_000;

// Which users a cron run checks: the approved, connected ones that are due (next_check_at passed or never
// set) and not held by another check, soonest first, at most `limit`. Pure, so it can be tested.
export function dueUsers(owners: Owner[], plan: Schedule[], now: number, limit = BATCH): Owner[] {
  const at = new Map(plan.map((s) => [s.id, s]));
  const due = (s: Schedule | undefined) =>
    (!s?.next_check_at || Date.parse(s.next_check_at) <= now) && (!s?.check_lock_until || Date.parse(s.check_lock_until) < now);
  const when = (o: Owner) => {
    const next = at.get(o.userId)?.next_check_at;
    return next ? Date.parse(next) : -Infinity;
  };
  return owners
    .filter((o) => due(at.get(o.userId)))
    .sort((a, b) => when(a) - when(b) || a.userId - b.userId)
    .slice(0, limit);
}

// One user's check under their poll_runs lock. Null when another check holds it.
async function runCheck(owner: Owner, now: string): Promise<{ vehicles: number; errors: string[] } | null> {
  const run = await startRun(owner, UNIQUE_VIOLATION);
  if (run === null) return null;
  const errors: string[] = [];
  let vehicles = 0;
  try {
    vehicles = await pollOwner(owner, now, errors);
  } catch (err) {
    errors.push(messageOf(err));
  }
  const ok = errors.length === 0;
  // The row is the lock: whatever happens to the full update, release it so the next check can run.
  try {
    await finishRun(run, { ok, vehicles_seen: vehicles, error: errors.join("; ") || null });
  } catch (err) {
    await finishRun(run, { ok: false, error: messageOf(err) }).catch(() => {});
    throw err;
  }
  return { vehicles, errors };
}

// The 15-minute cron: checks the users who are due, a few at a time, each about every 12 hours. From the
// Tesla budget's first cut point a user is next due in 12 hours; past the budget nobody is checked until
// the month resets. Streaming is never touched.
export async function checkDue(clock: () => number = Date.now): Promise<PollResult> {
  if (DEMO) return { ok: true, vehicles: 0, skipped: "demo" };
  const started = clock();
  await closeStaleRuns(new Date(started - STALE_RUN_MS).toISOString());
  const budget = await budgetState(started);
  if (budget.level === "stopped") {
    console.info(`Checks paused: the Tesla API estimate is past the budget this month`);
    return { ok: true, vehicles: 0, skipped: "budget" };
  }
  const every = CHECK_EVERY_MS[budget.level];
  const owners = await accountOwners();
  // No account yet fails the check the way a missing token does.
  if (owners.length === 0) return { ok: false, vehicles: 0, error: new NotConnectedError().message };

  let plan: Schedule[] | null;
  try {
    plan = await schedules();
  } catch (err) {
    if (!(err instanceof MissingSchema)) throw err;
    plan = null;
  }
  // Before the migration there's no schedule: check everyone together, as the 6-hourly cron did, once the
  // newest check is `every` old. Otherwise this cron, every 15 minutes, would check 24 times as often.
  if (plan === null) {
    const last = await lastRunStartedAt();
    if (last && started - Date.parse(last) < every) return { ok: true, vehicles: 0, skipped: "not due" };
    return checkEach(owners, clock, started, null);
  }
  const due = dueUsers(owners, plan, started);
  if (due.length === 0) return { ok: true, vehicles: 0, skipped: "not due" };
  return checkEach(due, clock, started, every);
}

// Checks each owner in turn until the run's time is up. With `every`, each is first claimed (and their next
// check moved on by `every`); a claim another run got first is skipped. Null: no schedule to claim.
async function checkEach(owners: Owner[], clock: () => number, started: number, every: number | null): Promise<PollResult> {
  const errors: string[] = [];
  let vehicles = 0;
  let users = 0;
  for (const owner of owners) {
    if (clock() - started > RUN_BUDGET_MS) break;
    const at = clock();
    const now = new Date(at).toISOString();
    let claimed = every === null;
    try {
      // A claim that fails is that user's error, never the whole run's.
      if (every !== null) claimed = await claimScheduledCheck(owner.userId, now, new Date(at + every).toISOString(), new Date(at + LOCK_MS).toISOString());
      if (!claimed) continue;
      const result = await runCheck(owner, now);
      if (result === null) {
        // Another check holds the user's lock: due again at the next run.
        if (every !== null) await releaseCheck(owner.userId, now).catch(() => {});
        continue;
      }
      users++;
      vehicles += result.vehicles;
      errors.push(...result.errors);
    } catch (err) {
      errors.push(messageOf(err));
    } finally {
      // Only a user this run claimed: never a lock another run holds.
      if (every !== null && claimed) await releaseCheck(owner.userId).catch(() => {});
    }
  }
  return { ok: errors.length === 0, vehicles, users, error: errors.join("; ") || undefined };
}

// The check after a sign-in: only the user who signed in, at most once per CHECK_NOW_GAP_MS, not while
// another check holds them, and not once the Tesla budget is spent. Their next scheduled check moves on.
export async function checkNow(owner: Owner, clock: () => number = Date.now): Promise<PollResult> {
  if (DEMO) return { ok: true, vehicles: 0, skipped: "demo" };
  const at = clock();
  const now = new Date(at).toISOString();
  const budget = await budgetState(at);
  if (budget.level === "stopped") return { ok: true, vehicles: 0, skipped: "budget" };
  await closeStaleRuns(new Date(at - STALE_RUN_MS).toISOString());
  let scheduled = true;
  try {
    const since = new Date(at - CHECK_NOW_GAP_MS).toISOString();
    const nextAt = new Date(at + CHECK_EVERY_MS[budget.level]).toISOString();
    if (!(await claimCheckNow(owner.userId, now, since, nextAt, new Date(at + LOCK_MS).toISOString()))) {
      return { ok: true, vehicles: 0, skipped: "too soon" };
    }
  } catch (err) {
    if (!(err instanceof MissingSchema)) throw err;
    // Before the migration: no limit to keep; the poll_runs lock still stops a second check at once.
    scheduled = false;
  }
  try {
    const result = await runCheck(owner, now);
    if (result === null) return { ok: true, vehicles: 0, skipped: "running" };
    return { ok: result.errors.length === 0, vehicles: result.vehicles, users: 1, error: result.errors.join("; ") || undefined };
  } finally {
    if (scheduled) await releaseCheck(owner.userId).catch(() => {});
  }
}

// One account's check: every car on its Tesla account. Errors per car go to `errors`; returns how many
// cars Tesla listed.
async function pollOwner(owner: Owner, now: string, errors: string[]): Promise<number> {
  const listed = await fleetGet<FleetVehicle[]>(owner, "/api/1/vehicles");
  const vehicles = Array.isArray(listed) ? listed : [];
  // Location is read only with the scope (granted at a sign-in since it was added), and only when the
  // car is already online for the check: never a wake.
  const located = await hasScope(owner, LOCATION_SCOPE).catch(() => false);
  const vins = vehicles.map((v) => v.vin);
  // Versions the stream saw first, before any car is read: a change the stream recorded keeps the time the
  // car reported it and the odometer then. Recorded by this check instead, it would carry the check's time,
  // and the stream sync after it reads only Version readings newer than that. The poll holds the lock, so
  // the sync skips its own lock check; it logs its own failures.
  await syncStreamVersionsSafely(owner, vins, { lockHeld: true });
  // Before the cars are read, so the stream syncs below read through windows that match the list. Only
  // from a real list: a null answer says nothing about which cars are the owner's.
  if (Array.isArray(listed)) await syncWindows(owner, vehicles.map((v) => v.id_s), now);
  // Supercharger history is extra and can never fail the check; it touches its own table, so it
  // runs alongside the vehicles. Each car is polled on its own: one failing can't block another.
  // The check holds the lock, so it is where a car's one-time full history read happens.
  const [results] = await Promise.all([
    Promise.allSettled(vehicles.map((vehicle) => pollVehicle(owner, vehicle, now, located))),
    syncChargingHistory(owner, vins, { backfill: true }).catch((err) =>
      console.warn("Charging history sync failed:", messageOf(err)),
    ),
    // Sessions rebuilt from Fleet Telemetry (AC and third-party charging); logs its own failures.
    syncStreamSessionsSafely(owner, vins),
  ]);
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      errors.push(`${vehicles[i].display_name ?? vehicles[i].vin}: ${messageOf(result.reason)}`);
    }
  });
  // Again for a car seen for the first time, which had no vehicles row for the first sync to start from.
  await syncStreamVersionsSafely(owner, vins, { lockHeld: true });
  // Uplink's key and streaming on each car, when the stored answer is old (/setup). After the cars are
  // read, so a first sign-in's cars have rows; never fails the check.
  await checkSetup(owner, Date.parse(now));
  return vehicles.length;
}
