// Drives and parked drain rebuilt from Fleet Telemetry readings. Pure (no database), so it can be tested
// with a script; lib/server/driving.ts does the reading.
//
// Gear, odometer, battery level and energy are streamed on change, at most every 5 minutes, so every time
// here is good to about 5 minutes and short drives lose some precision.
import { MILES_TO_KM } from "@/lib/car";
import { median, num, type Reading } from "@/lib/telemetry-derive";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type DriveInputs = {
  gear: Reading[];
  odometer: Reading[]; // miles
  battery: Reading[]; // %
  energy: Reading[]; // EnergyRemaining, kWh
  lifetime: Reading[]; // LifetimeEnergyUsed, kWh counter
  range: Reading[]; // RatedRange, miles
  charge: Reading[]; // DetailedChargeState
};

export type Drive = {
  start: number; // ms
  end: number;
  km: number;
  kwh: number | null;
  whPerKm: number | null; // only for drives of at least 1 km
  startLevel: number | null;
  endLevel: number | null;
};

// One stretch parked, like TeslaMate's vampire drain table: what was lost and how hard the car worked.
// kwh: EnergyRemaining at the start minus at the end; watts: that over the hours. awakeMs: time the car
// was seen sending data (see awakeBetween), a lower bound since a single reading counts as no time.
// A level or energy that rose (a charge never reported) has no loss.
export type ParkStats = {
  start: number;
  end: number;
  hours: number;
  lostPercent: number | null;
  lostKm: number | null;
  kwh: number | null;
  watts: number | null;
  awakeMs: number;
};

export type ParkedPeriod = ParkStats & { lostPercent: number; percentPerDay: number; kmPerDay: number | null };

// Parked right now: since the last drive or charge ended, up to the latest reading.
// fromFirstReading: no drive or charge in the readings, so it has been parked at least this long.
export type ParkedNow = ParkStats & { fromFirstReading: boolean };

export const MERGE_STOP_MS = 3 * MIN;
export const MIN_DRIVE_KM = 0.3;
export const MIN_PARKED_MS = 6 * HOUR;
// The car sends data only while awake, every few minutes. A silence longer than this means it slept.
export const WAKE_GAP_MS = 15 * MIN;
export const DRAIN_DAYS = 30;
export const DRIVE_DAYS = 90;
// Odometer and energy counters can arrive a little after the gear; they don't change while parked.
const LOOKAHEAD_MS = 10 * MIN;

type Point = { t: number; v: number };

function numeric(readings: Reading[]): Point[] {
  const points: Point[] = [];
  for (const r of readings) {
    const v = num(r.value);
    if (v !== null) points.push({ t: Date.parse(r.at), v });
  }
  return points.sort((a, b) => a.t - b.t);
}

// The last value at or before t, or null with none.
function valueAt(points: Point[], t: number): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : points[found].v;
}

// "ShiftStateP" -> "P"
function gearName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/^ShiftState/, "").trim();
  return /^[PDRN]$/.test(name) ? name : null;
}

type Trip = { start: number; end: number };

// A drive starts at the first gear that isn't P after P and ends at the next P. Drives with a stop shorter
// than MERGE_STOP_MS between them (a junction, a toll booth) are one drive. A drive still going has no end
// yet and is left out.
export function findTrips(gear: Reading[]): Trip[] {
  const sorted = gear
    .map((r) => ({ t: Date.parse(r.at), name: gearName(r.value) }))
    .filter((r): r is { t: number; name: string } => r.name !== null)
    .sort((a, b) => a.t - b.t);
  const trips: Trip[] = [];
  let parked = false;
  let start = 0;
  let driving = false;
  for (const { t, name } of sorted) {
    if (name === "P") {
      if (driving) trips.push({ start, end: t });
      driving = false;
      parked = true;
    } else if (parked && !driving) {
      driving = true;
      start = t;
    }
  }
  const merged: Trip[] = [];
  for (const trip of trips) {
    const last = merged[merged.length - 1];
    if (last && trip.start - last.end < MERGE_STOP_MS) last.end = trip.end;
    else merged.push({ ...trip });
  }
  return merged;
}

type Series = { odometer: Point[]; battery: Point[]; energy: Point[]; lifetime: Point[]; range: Point[] };

function describe(trip: Trip, nextStart: number, s: Series): Drive | null {
  // Counters are read up to a few minutes after the gear shows P, but never into the next drive.
  const settled = Math.min(trip.end + LOOKAHEAD_MS, nextStart - 1);
  const odoStart = valueAt(s.odometer, trip.start);
  const odoEnd = valueAt(s.odometer, settled);
  if (odoStart === null || odoEnd === null) return null;
  const km = (odoEnd - odoStart) * MILES_TO_KM;
  if (km < MIN_DRIVE_KM) return null;
  const usedStart = valueAt(s.lifetime, trip.start);
  const usedEnd = valueAt(s.lifetime, settled);
  let kwh: number | null = null;
  if (usedStart !== null && usedEnd !== null && usedEnd >= usedStart) {
    kwh = usedEnd - usedStart;
  } else {
    const leftStart = valueAt(s.energy, trip.start);
    const leftEnd = valueAt(s.energy, settled);
    if (leftStart !== null && leftEnd !== null && leftStart >= leftEnd) kwh = leftStart - leftEnd;
  }
  return {
    start: trip.start,
    end: trip.end,
    km,
    kwh,
    whPerKm: kwh !== null && km >= 1 ? (kwh * 1000) / km : null,
    startLevel: valueAt(s.battery, trip.start),
    endLevel: valueAt(s.battery, trip.end),
  };
}

function series(input: DriveInputs): Series {
  return {
    odometer: numeric(input.odometer),
    battery: numeric(input.battery),
    energy: numeric(input.energy),
    lifetime: numeric(input.lifetime),
    range: numeric(input.range),
  };
}

// Drives of at least MIN_DRIVE_KM, newest first.
export function buildDrives(input: DriveInputs): Drive[] {
  const trips = findTrips(input.gear);
  const s = series(input);
  const drives: Drive[] = [];
  trips.forEach((trip, i) => {
    const drive = describe(trip, trips[i + 1]?.start ?? Infinity, s);
    if (drive) drives.push(drive);
  });
  return drives.reverse();
}

const START_STATES = new Set(["Starting", "Charging"]);
const END_STATES = new Set(["Complete", "Stopped", "Disconnected", "NoPower"]);

// Time ranges the car was charging, from DetailedChargeState. One still going runs to Infinity.
export function chargeRanges(charge: Reading[]): [number, number][] {
  const ranges: [number, number][] = [];
  let open: number | null = null;
  const sorted = [...charge].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const r of sorted) {
    if (typeof r.value !== "string") continue;
    const state = r.value.replace(/^DetailedChargeState/, "");
    const t = Date.parse(r.at);
    if (START_STATES.has(state)) open ??= t;
    else if (END_STATES.has(state) && open !== null) {
      ranges.push([open, t]);
      open = null;
    }
  }
  if (open !== null) ranges.push([open, Infinity]);
  return ranges;
}

// Every time the car sent anything, sorted: it only sends while awake.
function readingTimes(input: DriveInputs): number[] {
  return Object.values(input)
    .flatMap((readings: Reading[]) => readings.map((r) => Date.parse(r.at)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

// Time the car was seen awake from start to end: each run of readings no more than WAKE_GAP_MS apart
// counts from its first reading to its last, and the run it parked in counts from the start.
export function awakeBetween(times: number[], start: number, end: number): number {
  let awake = 0;
  let runStart = start;
  let last = start;
  for (const t of times) {
    if (t <= start) continue;
    if (t > end) break;
    if (t - last > WAKE_GAP_MS) {
      awake += last - runStart;
      runStart = t;
    }
    last = t;
  }
  return awake + (last - runStart);
}

function parkStats(s: Series, times: number[], start: number, end: number): ParkStats {
  const hours = (end - start) / HOUR;
  const at = (points: Point[], t: number) => valueAt(points, t) ?? points.find((p) => p.t >= t)?.v ?? null;
  const drop = (points: Point[]) => {
    const a = at(points, start);
    const b = valueAt(points, end);
    return a !== null && b !== null && a - b >= 0 ? a - b : null;
  };
  const rangeMiles = drop(s.range);
  const kwh = drop(s.energy);
  return {
    start,
    end,
    hours,
    lostPercent: drop(s.battery),
    lostKm: rangeMiles === null ? null : rangeMiles * MILES_TO_KM,
    kwh,
    watts: kwh !== null && hours > 0 ? (kwh * 1000) / hours : null,
    awakeMs: awakeBetween(times, start, end),
  };
}

// Parked periods run from the end of one drive to the start of the next, minus any time charging, and
// count when at least MIN_PARKED_MS long. Drain is the battery level at the start minus the level at the
// end, scaled to a day. A period where the level rose (a charge the car never reported) is dropped.
// Only periods that ended in the last DRAIN_DAYS days count. Oldest first.
export function parkedDrain(input: DriveInputs, now: number): ParkedPeriod[] {
  const trips = findTrips(input.gear);
  const s = series(input);
  const charging = chargeRanges(input.charge);
  const times = readingTimes(input);
  const periods: ParkedPeriod[] = [];
  for (let i = 0; i + 1 < trips.length; i++) {
    const from = trips[i].end;
    const to = trips[i + 1].start;
    // Cut the stretch at every charge that overlaps it.
    const pieces: [number, number][] = [];
    let cursor = from;
    for (const [a, b] of charging) {
      if (b <= cursor) continue;
      if (a >= to) break;
      if (a > cursor) pieces.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < to) pieces.push([cursor, to]);
    for (const [start, end] of pieces) {
      if (end - start < MIN_PARKED_MS || end < now - DRAIN_DAYS * DAY) continue;
      if (valueAt(s.battery, start) === null) continue;
      const stats = parkStats(s, times, start, end);
      if (stats.lostPercent === null) continue;
      periods.push({
        ...stats,
        lostPercent: stats.lostPercent,
        percentPerDay: (stats.lostPercent / stats.hours) * 24,
        kmPerDay: stats.lostKm !== null ? (stats.lostKm / stats.hours) * 24 : null,
      });
    }
  }
  return periods;
}

export type DrainSummary = { percentPerDay: number; kmPerDay: number | null; periods: ParkedPeriod[] };

// The median of the qualifying periods, or null with fewer than two.
export function drainSummary(periods: ParkedPeriod[]): DrainSummary | null {
  if (periods.length < 2) return null;
  const km = periods.flatMap((p) => (p.kmPerDay === null ? [] : [p.kmPerDay]));
  return {
    percentPerDay: median(periods.map((p) => p.percentPerDay)),
    kmPerDay: km.length >= 2 ? median(km) : null,
    periods,
  };
}

// The stretch the car is parked in now: from the end of the last drive, or of a charge after it, to the
// latest battery reading. Null while driving or charging, or with no battery readings. Without a drive
// in the window it runs from the first reading. A level that rose (a charge never reported) has no loss.
export function parkedNow(input: DriveInputs): ParkedNow | null {
  const s = series(input);
  if (s.battery.length === 0) return null;
  const latest = s.battery[s.battery.length - 1];
  const trips = findTrips(input.gear);
  const lastGear = [...input.gear].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  if (lastGear && gearName(lastGear.value) !== null && gearName(lastGear.value) !== "P") return null;
  const charges = chargeRanges(input.charge);
  if (charges.some(([, b]) => b === Infinity)) return null;
  let start = trips.at(-1)?.end ?? s.battery[0].t;
  let fromFirstReading = trips.length === 0;
  for (const [, b] of charges) {
    if (b > start && b <= latest.t) {
      start = b;
      fromFirstReading = false;
    }
  }
  if (latest.t <= start) return null;
  return { ...parkStats(s, readingTimes(input), start, latest.t), fromFirstReading };
}

// parked: every qualifying stretch, oldest first; drain: their median once there are two.
export type Driving = { drives: Drive[]; drain: DrainSummary | null; parked: ParkedPeriod[]; parkedNow: ParkedNow | null };

export function analyseDriving(input: DriveInputs, now: number): Driving {
  const parked = parkedDrain(input, now);
  return { drives: buildDrives(input), drain: drainSummary(parked), parked, parkedNow: parkedNow(input) };
}
