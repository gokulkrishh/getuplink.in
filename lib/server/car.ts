import "server-only";
import {
  colorName,
  driveLabel,
  factory,
  generationLabel,
  hardwareLabel,
  interiorLabel,
  modelName,
  modelYear,
  roofLabel,
  wheelsLabel,
} from "@/lib/car";
import { DEMO } from "@/lib/demo";
import { istWeek, istWeekStart, num, packEstimates, typicalChargeKw, type WeeklyPack, weeklyPack } from "@/lib/telemetry-derive";
import { demoData, demoStreamSessions } from "./demo";
import { db } from "./supabase";
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
  // The latest check that saw the car online; the details need one.
  checkedAt: string | null;
  // The latest week's estimated full pack, as the battery trend on /stats/battery has it.
  battery: WeeklyPack | null;
  lastAcCharge: LastAcCharge | null;
};

// From the most recent finished AC session the car streamed. Only the parts the car reported.
export type LastAcCharge = { charger: string | null; cable: string | null };

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
  config: Config,
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
    checkedAt,
    battery: null,
    lastAcCharge: null,
  };
}

const CABLES: Record<string, string> = { IEC: "Type 2 (IEC)", SAE: "J1772 (SAE)", GB_AC: "GB/T AC" };

type AcChargeRow = {
  started_at: string;
  ended_at: string | null;
  peak_power_kw: unknown;
  ac_voltage: unknown;
  ac_amps: unknown;
  ac_phases: unknown;
  cable_type: unknown;
};

// The newest finished AC session, wherever it was.
async function loadLastAcCharge(vin: string): Promise<LastAcCharge | null> {
  let data: AcChargeRow | null;
  if (DEMO) {
    data = demoStreamSessions().find((s) => s.kind === "ac" && s.ended_at) ?? null;
  } else {
    const result = await db()
      .from("stream_charge_sessions")
      .select("started_at, ended_at, peak_power_kw, ac_voltage, ac_amps, ac_phases, cable_type")
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
  const readings = await loadReadingsByField(vin, ["ACChargingPower"], data.started_at, data.ended_at);
  const kw = typicalChargeKw(readings?.ACChargingPower ?? []) ?? num(data.peak_power_kw);
  const volts = num(data.ac_voltage);
  const amps = num(data.ac_amps);
  const phases = num(data.ac_phases);
  const charger = [
    kw !== null && kw > 0 && `${kw.toFixed(1)} kW`,
    volts !== null && `${Math.round(volts)} V`,
    amps !== null && `${Math.round(amps)} A`,
    phases === 1 ? "single-phase" : phases === 3 ? "three-phase" : false,
  ].filter(Boolean);
  const cable = typeof data.cable_type === "string" ? (CABLES[data.cable_type] ?? null) : null;
  return charger.length > 0 || cable ? { charger: charger.length > 0 ? charger.join(" · ") : null, cable } : null;
}

// The newest IST week's median full-pack estimate (see weeklyPack), from this week's and last week's readings:
// the battery trend's latest point whenever the car streamed in the last two weeks.
async function loadLatestWeekPack(vin: string, now: number): Promise<WeeklyPack | null> {
  const from = new Date(istWeekStart(istWeek(now) - 1)).toISOString();
  const readings = await loadReadingsByField(vin, ["EnergyRemaining", "BatteryLevel"], from, new Date(now).toISOString());
  // Battery health is extra; without it the page still shows everything else.
  return readings ? (weeklyPack(packEstimates(readings.EnergyRemaining, readings.BatteryLevel)).at(-1) ?? null) : null;
}

// Null when there's no such car.
export async function loadCarDetails(id: string): Promise<CarDetails | null> {
  if (!/^\d+$/.test(id)) return null;
  if (DEMO) {
    const { vehicle, snapshot, config } = demoData();
    if (id !== vehicle.id || !vehicle.vin) return null;
    const car = details(vehicle.id, vehicle.display_name, vehicle.vin, config, snapshot.polled_at);
    const [battery, lastAcCharge] = await Promise.all([loadLatestWeekPack(vehicle.vin, Date.now()), loadLastAcCharge(vehicle.vin)]);
    return { ...car, battery, lastAcCharge };
  }
  const [vehicle, snapshot] = await Promise.all([
    db().from("vehicles").select("id:id::text, vin, display_name").eq("id", id).maybeSingle(),
    db()
      .from("snapshots")
      .select(
        "polled_at, config:raw->vehicle_config",
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
  const v = vehicle.data as { id: string; vin: string | null; display_name: string | null };
  const s = snapshot.data as { polled_at: string; config: Config | null } | null;
  const car = details(v.id, v.display_name, v.vin, s?.config ?? {}, s?.polled_at ?? null);
  if (!v.vin) return car;
  const [battery, lastAcCharge] = await Promise.all([loadLatestWeekPack(v.vin, Date.now()), loadLastAcCharge(v.vin)]);
  return { ...car, battery, lastAcCharge };
}
