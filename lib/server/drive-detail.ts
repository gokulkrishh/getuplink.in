import "server-only";
import { MILES_TO_KM } from "@/lib/car";
import type { Drive } from "@/lib/drives";
import { num, type Reading } from "@/lib/telemetry-derive";
import { loadWindowStats } from "./driving";
import { loadPrimaryVehicle } from "./telemetry";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60_000;

export type TracePoint = { t: number; v: number };

// One drive with what the car streamed during it. Speed and outside temperature only exist once the car
// streams them (scripts/telemetry-config.mjs); until then those parts are null.
export type DriveDetail = {
  drive: Drive;
  battery: TracePoint[]; // %
  speed: TracePoint[]; // km/h
  rangeUsedKm: number | null;
  topKmh: number | null;
  outsideC: number | null; // median while driving
};

const points = (readings: Reading[], from: number, to: number, scale = 1): TracePoint[] =>
  readings.flatMap((r) => {
    const t = Date.parse(r.at);
    const v = num(r.value);
    return v === null || t < from || t > to ? [] : [{ t, v: v * scale }];
  });

// The last value at or before t, from readings sorted by time.
const valueAt = (list: TracePoint[], t: number) => list.findLast((p) => p.t <= t)?.v ?? null;

// The drive that started at `start` (ms), as the Driving page lists it, or null.
export async function loadDriveDetail(start: number, now: number): Promise<DriveDetail | null> {
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  if (!vin) return null;
  const drive = (await loadWindowStats(vin, now)).driving.drives.find((d) => d.start === start);
  if (!drive) return null;
  // A little either side, so the values in force at the start and end are there.
  const from = new Date(drive.start - 30 * MIN).toISOString();
  const to = new Date(drive.end + 10 * MIN).toISOString();
  const byField = (await loadReadingsByField(vin, ["BatteryLevel", "RatedRange", "VehicleSpeed", "OutsideTemp"], from, to)) ?? {};
  const read = (field: string) => [...(byField[field] ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const range = points(read("RatedRange"), drive.start - 30 * MIN, drive.end + 10 * MIN);
  const rangeStart = valueAt(range, drive.start);
  const rangeEnd = valueAt(range, drive.end + 5 * MIN);
  // VehicleSpeed arrives in mph, like the odometer and rated range.
  const speed = points(read("VehicleSpeed"), drive.start, drive.end, MILES_TO_KM);
  const temps = points(read("OutsideTemp"), drive.start - 30 * MIN, drive.end).map((p) => p.v).sort((a, b) => a - b);
  // The battery from the reading in force at the start, so the trace begins with the drive.
  const allBattery = points(read("BatteryLevel"), drive.start - 30 * MIN, drive.end + 10 * MIN);
  const startLevel = valueAt(allBattery, drive.start);
  const battery = [...(startLevel === null ? [] : [{ t: drive.start, v: startLevel }]), ...allBattery.filter((p) => p.t > drive.start && p.t <= drive.end + 5 * MIN)];

  return {
    drive,
    battery,
    speed,
    rangeUsedKm: rangeStart !== null && rangeEnd !== null && rangeStart >= rangeEnd ? (rangeStart - rangeEnd) * MILES_TO_KM : null,
    topKmh: speed.length ? Math.max(...speed.map((p) => p.v)) : null,
    outsideC: temps.length ? temps[Math.floor(temps.length / 2)] : null,
  };
}
