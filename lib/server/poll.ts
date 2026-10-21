import "server-only";
import { db } from "./supabase";
import { fleetGet, TeslaError } from "./tesla";

type FleetVehicle = {
  id: number;
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
  vehicle_state?: { car_version?: string; software_update?: SoftwareUpdate };
};

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
  const existing = await check(
    db().from("vehicles").select("current_version").eq("id", vehicle.id).maybeSingle(),
  );
  const base = {
    id: vehicle.id,
    vin: vehicle.vin,
    display_name: vehicle.display_name,
    last_state: vehicle.state,
    last_polled_at: now,
    updated_at: now,
  };

  // Never wake the car: vehicle_data is only requested when it is already online.
  if (vehicle.state !== "online") {
    await check(db().from("vehicles").upsert(base));
    await check(db().from("snapshots").insert({ vehicle_id: vehicle.id, polled_at: now, state: vehicle.state }));
    return;
  }

  let data: VehicleData;
  try {
    data = await fleetGet<VehicleData>(`/api/1/vehicles/${vehicle.vin}/vehicle_data?endpoints=vehicle_state`);
  } catch (err) {
    // 408: the car fell asleep between the list call and this one.
    if (err instanceof TeslaError && err.status === 408) {
      await check(db().from("vehicles").upsert({ ...base, last_state: "asleep" }));
      await check(
        db().from("snapshots").insert({
          vehicle_id: vehicle.id,
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

  await check(
    db()
      .from("vehicles")
      .upsert({ ...base, last_seen_at: now, ...(version ? { current_version: version } : {}) }),
  );
  await check(
    db().from("snapshots").insert({
      vehicle_id: vehicle.id,
      polled_at: now,
      state: "online",
      car_version: state.car_version ?? null,
      update_status: update.status || null,
      update_version: normaliseVersion(update.version),
      download_perc: update.download_perc ?? null,
      install_perc: update.install_perc ?? null,
      expected_duration_sec: update.expected_duration_sec ?? null,
      scheduled_time_ms: update.scheduled_time_ms ?? null,
      raw: data.vehicle_state ?? null,
    }),
  );
  if (version && version !== previous) {
    await check(
      db().from("version_history").insert({
        vehicle_id: vehicle.id,
        version,
        previous_version: previous,
        detected_at: now,
      }),
    );
  }
}

export type PollResult = { ok: boolean; vehicles: number; error?: string };

export async function pollAll(): Promise<PollResult> {
  const run = await check(db().from("poll_runs").insert({}).select("id").single());
  const now = new Date().toISOString();
  const errors: string[] = [];
  let vehicles: FleetVehicle[] = [];

  try {
    vehicles = await fleetGet<FleetVehicle[]>("/api/1/vehicles");
    for (const vehicle of vehicles) {
      try {
        await pollVehicle(vehicle, now);
      } catch (err) {
        errors.push(`${vehicle.display_name ?? vehicle.vin}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    errors.push((err as Error).message);
  }

  const result: PollResult = { ok: errors.length === 0, vehicles: vehicles.length, error: errors.join("; ") || undefined };
  await check(
    db()
      .from("poll_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: result.ok,
        vehicles_seen: result.vehicles,
        error: result.error ?? null,
      })
      .eq("id", run!.id),
  );
  return result;
}
