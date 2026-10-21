import "server-only";
import {
  colorName,
  driveLabel,
  factory,
  generationLabel,
  hardwareLabel,
  interiorLabel,
  MILES_TO_KM,
  modelName,
  modelYear,
  roofLabel,
  wheelsLabel,
} from "@/lib/car";
import { median, num, roundKwh } from "@/lib/telemetry-derive";
import { loadPackEstimates } from "./battery";
import { db } from "./supabase";

// What the car details page shows. Everything comes from Tesla's own replies: the car's VIN and the
// vehicle_config / vehicle_state / charge_state sections of the latest check that saw the car online.
export type CarDetails = {
  id: string;
  name: string;
  vin: string | null;
  model: string | null;
  generation: string | null;
  year: number | null;
  factory: string | null;
  drive: string | null;
  paint: string | null;
  wheels: string | null;
  roof: string | null;
  interior: string | null;
  hardware: string | null;
  chargePort: string | null;
  steering: string | null;
  seatCooling: boolean | null;
  rearSeatHeaters: boolean | null;
  airSuspension: boolean | null;
  version: string | null;
  odometerKm: number | null;
  batteryLevel: number | null;
  rangeKm: number | null;
  chargeLimit: number | null;
  checkedAt: string | null;
  battery: BatteryHealth | null;
};

// Estimated full-pack energy from the car's streamed readings: energy remaining ÷ battery level,
// using readings the car sent together. The median over the last 30 days, so one odd reading doesn't move it.
export type BatteryHealth = { packKwh: number; readings: number; since: string };

type Config = Partial<{
  car_type: string;
  trim_badging: string;
  performance_package: string;
  efficiency_package: string;
  exterior_color: string;
  wheel_type: string;
  roof_color: string;
  interior_trim_type: string;
  driver_assist: string;
  charge_port_type: string;
  rhd: boolean;
  has_seat_cooling: boolean;
  rear_seat_heaters: number;
  has_air_suspension: boolean;
}>;

function details(
  id: string,
  name: string | null,
  vin: string | null,
  version: string | null,
  config: Config,
  odometerMiles: number | null,
  batteryLevel: number | null,
  rangeKm: number | null,
  chargeLimit: number | null,
  checkedAt: string | null,
): CarDetails {
  const model = modelName(config.car_type);
  return {
    id,
    name: name || model || "Tesla",
    vin,
    model,
    generation: generationLabel(config.efficiency_package),
    year: modelYear(vin),
    factory: factory(vin),
    drive: driveLabel(config.trim_badging, config.performance_package),
    paint: colorName(config.exterior_color),
    wheels: wheelsLabel(config.wheel_type),
    roof: roofLabel(config.roof_color),
    interior: interiorLabel(config.interior_trim_type),
    hardware: hardwareLabel(config.driver_assist),
    chargePort: config.charge_port_type ?? null,
    steering: config.rhd === undefined ? null : config.rhd ? "Right-hand drive" : "Left-hand drive",
    seatCooling: config.has_seat_cooling ?? null,
    rearSeatHeaters: config.rear_seat_heaters === undefined ? null : config.rear_seat_heaters > 0,
    airSuspension: config.has_air_suspension ?? null,
    version,
    odometerKm: odometerMiles === null ? null : Math.round(odometerMiles * MILES_TO_KM),
    batteryLevel,
    rangeKm,
    chargeLimit,
    checkedAt,
    battery: null,
  };
}

async function loadBatteryHealth(vin: string): Promise<BatteryHealth | null> {
  const estimates = await loadPackEstimates(vin, new Date(Date.now() - 30 * 86_400_000).toISOString());
  // Battery health is extra; without it the page still shows everything else.
  if (!estimates || estimates.length === 0) return null;
  return { packKwh: roundKwh(median(estimates.map((e) => e.kwh))), readings: estimates.length, since: estimates[0].at };
}

// Null when there's no such car.
export async function loadCarDetails(id: string): Promise<CarDetails | null> {
  if (!/^\d+$/.test(id)) return null;
  const [vehicle, snapshot] = await Promise.all([
    db().from("vehicles").select("id:id::text, vin, display_name, current_version").eq("id", id).maybeSingle(),
    db()
      .from("snapshots")
      .select(
        "polled_at, battery_level, battery_range_km, charge_limit, config:raw->vehicle_config, odometer:raw->vehicle_state->>odometer",
      )
      .eq("vehicle_id", id)
      .eq("state", "online")
      .not("raw->vehicle_config", "is", null)
      .order("polled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (vehicle.error) throw new Error(`Reading the car failed: ${vehicle.error.message}`);
  if (snapshot.error) throw new Error(`Reading the car's last check failed: ${snapshot.error.message}`);
  if (!vehicle.data) return null;
  const v = vehicle.data as { id: string; vin: string | null; display_name: string | null; current_version: string | null };
  const s = snapshot.data as {
    polled_at: string;
    battery_level: unknown;
    battery_range_km: unknown;
    charge_limit: unknown;
    config: Config | null;
    odometer: string | null;
  } | null;
  const car = details(
    v.id,
    v.display_name,
    v.vin,
    v.current_version,
    s?.config ?? {},
    num(s?.odometer),
    num(s?.battery_level),
    num(s?.battery_range_km),
    num(s?.charge_limit),
    s?.polled_at ?? null,
  );
  return v.vin ? { ...car, battery: await loadBatteryHealth(v.vin) } : car;
}
