import "server-only";
import { type AcSupply, acSupply } from "@/lib/ac-charge";
import {
  colorName,
  driveLabel,
  factory,
  generationLabel,
  hardwareLabel,
  interiorLabel,
  likelyLfp,
  modelName,
  motorLayout,
  modelYear,
  roofLabel,
  trimLabel,
  tyrePressureLabel,
  wheelsLabel,
} from "@/lib/car";
import { DEMO } from "@/lib/demo";
import { istWeek, istWeekStart, num, packEstimates, typicalChargeKw, type WeeklyPack, weeklyPack } from "@/lib/telemetry-derive";
import { demoData, demoStreamSessions } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { loadReadingsByField } from "./telemetry-window";

// What the car details page shows: the car's VIN and the vehicle_config section of the latest check that
// saw the car online, with the battery's weekly figure and the last AC charge from its streamed readings.
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
  exteriorTrim: string | null;
  // Battery & drive. Chemistry is a guess (see likelyLfp), so it's only ever "LFP" or unknown.
  pack: string | null;
  likelyLfp: boolean;
  motor: string | null;
  rearDriveUnit: string | null;
  tyrePressure: string | null;
  // The vehicle row's current_version and the latest online check's car_version: the page picks the
  // version now from these and the streamed Version (see currentVersion). The odometer at that check (miles).
  rowVersion: string | null;
  checkedVersion: { version: string; at: string } | null;
  polledOdometer: { miles: number; at: string } | null;
  // The features the car says it has, readable; empty when it said none.
  supported: string[];
  // The latest check that saw the car online; the details need one.
  checkedAt: string | null;
  // The latest week's estimated full pack, as the battery trend on /stats/battery has it.
  battery: WeeklyPack | null;
  lastAcCharge: LastAcCharge | null;
};

// From the most recent finished AC session the car streamed: its id (for /stats/charging/[id]), when it
// ended, the typical power and how it was supplied. Only the parts the car reported.
export type LastAcCharge = { id: number; endedAt: string; kw: number | null; supply: AcSupply | null };

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
  rear_drive_unit: string;
  front_drive_unit: string;
  default_charge_to_max: boolean;
  motorized_charge_port: boolean;
  wheel_caps_on: boolean;
  exterior_trim: string;
}>;

// The parts of the poll's vehicle_state the page uses.
type VehicleState = Partial<{
  tpms_rcp_front_value: number;
  tpms_rcp_rear_value: number;
  odometer: number;
  sentry_mode_available: boolean;
  dashcam_clip_save_supported: boolean;
  webcam_supported: boolean;
}>;

type Check = { polledAt: string; config: Config; state: VehicleState; supercharging: boolean | null };

function details(
  id: string,
  name: string | null,
  vin: string | null,
  rowVersion: string | null,
  check: (Check & { version: string | null }) | null,
): CarDetails {
  const config = check?.config ?? {};
  const state = check?.state ?? {};
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
    wheels: [wheelsLabel(config.wheel_type), config.wheel_caps_on && "aero covers"].filter(Boolean).join(" · ") || null,
    roof: roofLabel(config.roof_color),
    interior: interiorLabel(config.interior_trim_type),
    hardware: hardwareLabel(config.driver_assist),
    chargePort: [config.charge_port_type, config.motorized_charge_port && "motorised door"].filter(Boolean).join(" · ") || null,
    steering: config.rhd === undefined ? null : config.rhd ? "Right-hand drive" : "Left-hand drive",
    seatCooling: config.has_seat_cooling ?? null,
    rearSeatHeaters: config.rear_seat_heaters === undefined ? null : config.rear_seat_heaters > 0,
    airSuspension: config.has_air_suspension ?? null,
    exteriorTrim: colorName(config.exterior_trim),
    pack: trimLabel(config.trim_badging),
    likelyLfp: likelyLfp(vin, config.default_charge_to_max),
    motor: motorLayout(config.rear_drive_unit, config.front_drive_unit),
    rearDriveUnit: config.rear_drive_unit ?? null,
    tyrePressure: tyrePressureLabel(state.tpms_rcp_front_value, state.tpms_rcp_rear_value),
    rowVersion,
    checkedVersion: check?.version ? { version: check.version, at: check.polledAt } : null,
    polledOdometer: check && typeof state.odometer === "number" && state.odometer > 0 ? { miles: state.odometer, at: check.polledAt } : null,
    supported: [
      state.sentry_mode_available && "Sentry mode",
      state.dashcam_clip_save_supported && "Dashcam",
      state.webcam_supported && "Cabin camera",
      check?.supercharging && "Supercharging",
    ].filter((s): s is string => typeof s === "string"),
    checkedAt: check?.polledAt ?? null,
    battery: null,
    lastAcCharge: null,
  };
}

type AcChargeRow = {
  id: number;
  started_at: string;
  ended_at: string | null;
  peak_power_kw: unknown;
  ac_voltage: unknown;
  ac_amps: unknown;
  ac_phases: unknown;
  cable_type: unknown;
};

// The newest finished AC session, wherever it was.
async function loadLastAcCharge(owner: Owner, vin: string): Promise<LastAcCharge | null> {
  let data: AcChargeRow | null;
  if (DEMO) {
    data = demoStreamSessions().find((s) => s.kind === "ac" && s.ended_at) ?? null;
  } else {
    const result = await ownerDb(owner)
      .from("stream_charge_sessions")
      .select("id, started_at, ended_at, peak_power_kw, ac_voltage, ac_amps, ac_phases, cable_type")
      .eq("vin", vin)
      .eq("kind", "ac")
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Extra detail; the page works without it (and before the columns exist).
    data = result.error ? null : result.data;
  }
  if (!data?.ended_at) return null;
  // The typical draw over the session's window; the peak when there are too few readings.
  const readings = await loadReadingsByField(owner, vin, ["ACChargingPower"], data.started_at, data.ended_at);
  const kw = typicalChargeKw(readings?.ACChargingPower ?? []) ?? num(data.peak_power_kw);
  const supply = acSupply(data);
  const power = kw !== null && kw > 0 ? Math.round(kw * 10) / 10 : null;
  return power !== null || supply ? { id: data.id, endedAt: data.ended_at, kw: power, supply } : null;
}

// The newest IST week's median full-pack estimate (see weeklyPack), from this week's and last week's readings:
// the battery trend's latest point whenever the car streamed in the last two weeks.
async function loadLatestWeekPack(owner: Owner, vin: string, now: number): Promise<WeeklyPack | null> {
  const from = new Date(istWeekStart(istWeek(now) - 1)).toISOString();
  const readings = await loadReadingsByField(owner, vin, ["EnergyRemaining", "BatteryLevel"], from, new Date(now).toISOString());
  // Battery health is extra; without it the page still shows everything else.
  return readings ? (weeklyPack(packEstimates(readings.EnergyRemaining, readings.BatteryLevel)).at(-1) ?? null) : null;
}

// Null when the owner has no such car.
export async function loadCarDetails(owner: Owner, id: string): Promise<CarDetails | null> {
  if (!/^\d+$/.test(id)) return null;
  if (DEMO) {
    const { vehicle, snapshot, config, vehicleState, superchargingEnabled } = demoData();
    if (id !== vehicle.id || !vehicle.vin) return null;
    const car = details(vehicle.id, vehicle.display_name, vehicle.vin, vehicle.current_version, {
      polledAt: snapshot.polled_at,
      version: snapshot.car_version,
      config,
      state: vehicleState,
      supercharging: superchargingEnabled,
    });
    const [battery, lastAcCharge] = await Promise.all([loadLatestWeekPack(owner, vehicle.vin, Date.now()), loadLastAcCharge(owner, vehicle.vin)]);
    return { ...car, battery, lastAcCharge };
  }
  const [vehicle, snapshot] = await Promise.all([
    ownerDb(owner).from("vehicles").select("id:id::text, vin, display_name, current_version").eq("id", id).maybeSingle(),
    ownerDb(owner)
      .from("snapshots")
      // Picked keys only: vehicle_state carries more than the page needs, and nothing location-related is read.
      .select(
        [
          "polled_at, car_version, config:raw->vehicle_config, supercharging:raw->supercharging_enabled",
          "tpms_front:raw->vehicle_state->tpms_rcp_front_value, tpms_rear:raw->vehicle_state->tpms_rcp_rear_value, odometer:raw->vehicle_state->odometer",
          "sentry:raw->vehicle_state->sentry_mode_available, dashcam:raw->vehicle_config->dashcam_clip_save_supported",
          "webcam:raw->vehicle_config->webcam_supported",
        ].join(", "),
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
    car_version: string | null;
    config: Config | null;
    supercharging: unknown;
    tpms_front: unknown;
    tpms_rear: unknown;
    odometer: unknown;
    sentry: unknown;
    dashcam: unknown;
    webcam: unknown;
  } | null;
  const flag = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const car = details(
    v.id,
    v.display_name,
    v.vin,
    v.current_version,
    s && {
      polledAt: s.polled_at,
      version: s.car_version,
      config: s.config ?? {},
      state: {
        tpms_rcp_front_value: num(s.tpms_front) ?? undefined,
        tpms_rcp_rear_value: num(s.tpms_rear) ?? undefined,
        odometer: num(s.odometer) ?? undefined,
        sentry_mode_available: flag(s.sentry),
        dashcam_clip_save_supported: flag(s.dashcam),
        webcam_supported: flag(s.webcam),
      },
      supercharging: flag(s.supercharging) ?? null,
    },
  );
  if (!v.vin) return car;
  const [battery, lastAcCharge] = await Promise.all([loadLatestWeekPack(owner, v.vin, Date.now()), loadLastAcCharge(owner, v.vin)]);
  return { ...car, battery, lastAcCharge };
}
