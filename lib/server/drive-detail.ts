import "server-only";
import type { Owner } from "./data/owner";
import { MILES_TO_KM } from "@/lib/car";
import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { median, num, type Reading } from "@/lib/telemetry-derive";
import { groupTrips, type Trip } from "@/lib/trips";
import { tripRoute } from "@/lib/trip-route";
import { loadWindowStats } from "./driving";
import { loadPrimaryVehicle } from "./telemetry";
import { loadHardAccel, loadReadingsByField } from "./telemetry-window";
import { USUAL_DAYS, usualHardMoments, usualWhPerKm } from "@/lib/drive-verdict";

const MIN = 60_000;

export type TracePoint = { t: number; v: number };

// One trip (a single drive, or drives with short stops between; see groupTrips) with what the car
// streamed during it. Speed and outside temperature only exist once the car streams them
// (scripts/telemetry-config.mjs); until then those parts are null.
export type DriveDetail = {
  vehicleId: string; // the owner's car row, which keys the drive's stored wording
  trip: Trip;
  battery: TracePoint[]; // %
  speed: TracePoint[]; // km/h
  rangeUsedKm: number | null;
  topKmh: number | null;
  outsideC: number | null; // median while driving
  accel: TracePoint[]; // m/s², forward positive, braking negative, while moving
  power: TracePoint[]; // kW from the pack, regen negative, while moving
  grade: TracePoint[]; // road grade %, uphill positive, while moving
  route: MapPoint[]; // where the car was, while each leg was under way
  pins: MapPin[]; // the start, each stop and the end
  // The owner's usual, from their other drives in the last USUAL_DAYS (see lib/drive-verdict.ts): Wh/km,
  // and hard starts and stops a drive. Each null until there are enough drives to compare.
  usual: { whPerKm: number | null; hard: number | null };
  // The battery's usable capacity, the latest week's (see batteryTrend), for range on a full charge.
  usableKwh: number | null;
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
export async function loadDriveDetail(owner: Owner, start: number, now: number, leg = false): Promise<DriveDetail | null> {
  const car = await loadPrimaryVehicle(owner);
  const vin = car?.vin ?? null;
  if (!car || !vin) return null;
  const window = await loadWindowStats(owner, vin, now);
  const drives = window.driving.drives;
  const usableKwh = window.trend.at(-1)?.kwh ?? null;
  const drive0 = drives.find((d) => d.start === start);
  if (!drive0) return null;
  const trip = (!leg && groupTrips(drives).find((t) => t.start === start && t.legs.length > 1)) || groupTrips([drive0])[0];
  // The span the traces cover: the whole trip, stops included.
  const drive = { start: trip.start, end: trip.end };
  // A little either side, so the values in force at the start and end are there.
  const from = new Date(drive.start - 30 * MIN).toISOString();
  const to = new Date(drive.end + 10 * MIN).toISOString();
  const [byField, hardAccel] = await Promise.all([
    loadReadingsByField(owner, vin, ["BatteryLevel", "VehicleSpeed", "OutsideTemp", "Location", "LongitudinalAcceleration", "PackVoltage", "PackCurrent", "GradeEstimatePercent"], from, to).then((r) => r ?? {}),
    loadHardAccel(owner, vin, new Date(now - USUAL_DAYS * 86_400_000).toISOString(), new Date(now + 1).toISOString()),
  ]);
  const read = (field: string) => [...(byField[field] ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Range used is the legs' own (see lib/drives.ts), so a stop's parked use or a charge isn't counted.
  const rangeUsedKm = trip.legs.every((d) => d.rangeKm != null) ? trip.legs.reduce((sum, d) => sum + d.rangeKm!, 0) : null;
  // VehicleSpeed arrives in mph, like the odometer and rated range. Only while a leg is under way.
  const moving = (t: number) => trip.legs.some((d) => t >= d.start && t <= d.end);
  const speed = points(read("VehicleSpeed"), drive.start, drive.end, MILES_TO_KM).filter((p) => moving(p.t));
  // Outside temperature while driving: the reading in force at the start, then those during the trip.
  const allTemps = points(read("OutsideTemp"), drive.start - 30 * MIN, drive.end);
  const tempAtStart = allTemps.findLast((p) => p.t <= drive.start);
  const temps = [...(tempAtStart ? [tempAtStart] : []), ...allTemps.filter((p) => p.t > drive.start)].map((p) => p.v);
  // The battery from the level the trip started at (lib/drives.ts picks it, never a mid-charge reading),
  // so the trace begins with the drive.
  const startLevel = trip.startLevel;
  const allBattery = points(read("BatteryLevel"), drive.start, drive.end + 10 * MIN);
  const battery = [...(startLevel === null ? [] : [{ t: drive.start, v: startLevel }]), ...allBattery.filter((p) => p.t > drive.start && p.t <= drive.end + 5 * MIN)];

  const { route, pins } = tripRoute(trip, read("Location"));
  // LongitudinalAcceleration in m/s² as the car reports it: positive speeding up, negative braking.
  const accel = points(read("LongitudinalAcceleration"), drive.start, drive.end).filter((p) => moving(p.t));
  const grade = points(read("GradeEstimatePercent"), drive.start, drive.end).filter((p) => moving(p.t));
  // Power is pack voltage times current, each current reading paired with the voltage in force. Tesla
  // doesn't document the current's sign, so it's read from the drive: driving uses more than regen gives
  // back, so the median must be positive; if it isn't, the sign is flipped.
  const volts = points(read("PackVoltage"), drive.start - 30 * MIN, drive.end);
  const raw = points(read("PackCurrent"), drive.start, drive.end)
    .filter((p) => moving(p.t))
    .flatMap((p) => {
      const v = valueAt(volts, p.t);
      return v === null ? [] : [{ t: p.t, v: (v * p.v) / 1000 }];
    });
  const sorted = raw.map((p) => p.v).sort((a, b) => a - b);
  const flip = sorted.length > 0 && sorted[Math.floor(sorted.length / 2)] < 0 ? -1 : 1;
  const power = raw.map((p) => ({ t: p.t, v: p.v * flip }));
  // The usual to judge this trip against, from the other drives (never this trip's own legs).
  const own = new Set(trip.legs.map((d) => d.start));
  const others = drives.filter((d) => !own.has(d.start));
  const usual = {
    whPerKm: usualWhPerKm(others, trip.start, now),
    hard: hardAccel ? usualHardMoments(points(hardAccel.hard, 0, Infinity), others, trip.start, now, hardAccel.since === null ? null : Date.parse(hardAccel.since)) : null,
  };

  return {
    vehicleId: car.id,
    trip,
    accel,
    power,
    grade,
    route,
    pins,
    battery,
    speed,
    rangeUsedKm,
    topKmh: speed.length ? Math.max(...speed.map((p) => p.v)) : null,
    outsideC: temps.length ? median(temps) : null,
    usual,
    usableKwh,
  };
}
