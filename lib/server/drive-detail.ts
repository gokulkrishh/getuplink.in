import "server-only";
import { MILES_TO_KM } from "@/lib/car";
import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { num, type Reading } from "@/lib/telemetry-derive";
import { groupTrips, type Trip } from "@/lib/trips";
import { tripRoute } from "@/lib/trip-route";
import { loadWindowStats } from "./driving";
import { loadPrimaryVehicle } from "./telemetry";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60_000;

export type TracePoint = { t: number; v: number };

// One trip (a single drive, or drives with short stops between; see groupTrips) with what the car
// streamed during it. Speed and outside temperature only exist once the car streams them
// (scripts/telemetry-config.mjs); until then those parts are null.
export type DriveDetail = {
  trip: Trip;
  battery: TracePoint[]; // %
  speed: TracePoint[]; // km/h
  rangeUsedKm: number | null;
  topKmh: number | null;
  outsideC: number | null; // median while driving
  accel: TracePoint[]; // m/s², forward positive, braking negative, while moving
  route: MapPoint[]; // where the car was, while each leg was under way
  pins: MapPin[]; // the start, each stop and the end
};

const points = (readings: Reading[], from: number, to: number, scale = 1): TracePoint[] =>
  readings.flatMap((r) => {
    const t = Date.parse(r.at);
    const v = num(r.value);
    return v === null || t < from || t > to ? [] : [{ t, v: v * scale }];
  });

// The last value at or before t, from readings sorted by time.
const valueAt = (list: TracePoint[], t: number) => list.findLast((p) => p.t <= t)?.v ?? null;

// The trip that starts at `start` (ms), or with `leg`, just the drive that does (a leg of a longer trip;
// the first leg starts when its trip does).
export async function loadDriveDetail(start: number, now: number, leg = false): Promise<DriveDetail | null> {
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  if (!vin) return null;
  const drives = (await loadWindowStats(vin, now)).driving.drives;
  const drive0 = drives.find((d) => d.start === start);
  if (!drive0) return null;
  const trip = (!leg && groupTrips(drives).find((t) => t.start === start && t.legs.length > 1)) || groupTrips([drive0])[0];
  // The span the traces cover: the whole trip, stops included.
  const drive = { start: trip.start, end: trip.end };
  // A little either side, so the values in force at the start and end are there.
  const from = new Date(drive.start - 30 * MIN).toISOString();
  const to = new Date(drive.end + 10 * MIN).toISOString();
  const byField = (await loadReadingsByField(vin, ["BatteryLevel", "RatedRange", "VehicleSpeed", "OutsideTemp", "Location", "LongitudinalAcceleration"], from, to)) ?? {};
  const read = (field: string) => [...(byField[field] ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const range = points(read("RatedRange"), drive.start - 30 * MIN, drive.end + 10 * MIN);
  const rangeStart = valueAt(range, drive.start);
  const rangeEnd = valueAt(range, drive.end + 5 * MIN);
  // VehicleSpeed arrives in mph, like the odometer and rated range. Only while a leg is under way.
  const moving = (t: number) => trip.legs.some((d) => t >= d.start && t <= d.end);
  const speed = points(read("VehicleSpeed"), drive.start, drive.end, MILES_TO_KM).filter((p) => moving(p.t));
  const temps = points(read("OutsideTemp"), drive.start - 30 * MIN, drive.end).map((p) => p.v).sort((a, b) => a - b);
  // The battery from the reading in force at the start, so the trace begins with the drive.
  const allBattery = points(read("BatteryLevel"), drive.start - 30 * MIN, drive.end + 10 * MIN);
  const startLevel = valueAt(allBattery, drive.start);
  const battery = [...(startLevel === null ? [] : [{ t: drive.start, v: startLevel }]), ...allBattery.filter((p) => p.t > drive.start && p.t <= drive.end + 5 * MIN)];

  const { route, pins } = tripRoute(trip, read("Location"));
  // LongitudinalAcceleration in m/s² as the car reports it: positive speeding up, negative braking.
  const accel = points(read("LongitudinalAcceleration"), drive.start, drive.end).filter((p) => moving(p.t));

  return {
    trip,
    accel,
    route,
    pins,
    battery,
    speed,
    rangeUsedKm: rangeStart !== null && rangeEnd !== null && rangeStart >= rangeEnd ? (rangeStart - rangeEnd) * MILES_TO_KM : null,
    topKmh: speed.length ? Math.max(...speed.map((p) => p.v)) : null,
    outsideC: temps.length ? temps[Math.floor(temps.length / 2)] : null,
  };
}
