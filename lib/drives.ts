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

export type ParkedPeriod = {
  start: number;
  end: number;
  hours: number;
  percentPerDay: number;
  kmPerDay: number | null;
};

export const MERGE_STOP_MS = 3 * MIN;
export const MIN_DRIVE_KM = 0.3;
export const MIN_PARKED_MS = 6 * HOUR;
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

// Parked periods run from the end of one drive to the start of the next, minus any time charging, and
// count when at least MIN_PARKED_MS long. Drain is the battery level at the start minus the level at the
// end, scaled to a day. A period where the level rose (a charge the car never reported) is dropped.
// Only periods that ended in the last DRAIN_DAYS days count. Oldest first.
export function parkedDrain(input: DriveInputs, now: number): ParkedPeriod[] {
  const trips = findTrips(input.gear);
  const s = series(input);
  const charging = chargeRanges(input.charge);
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
      const levelStart = valueAt(s.battery, start);
      const levelEnd = valueAt(s.battery, end);
      if (levelStart === null || levelEnd === null) continue;
      const drop = levelStart - levelEnd;
      if (drop < 0) continue;
      const hours = (end - start) / HOUR;
      const rangeStart = valueAt(s.range, start);
      const rangeEnd = valueAt(s.range, end);
      const rangeDrop = rangeStart !== null && rangeEnd !== null ? rangeStart - rangeEnd : null;
      periods.push({
        start,
        end,
        hours,
        percentPerDay: (drop / hours) * 24,
        kmPerDay: rangeDrop !== null && rangeDrop >= 0 ? ((rangeDrop * MILES_TO_KM) / hours) * 24 : null,
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

export type Driving = { drives: Drive[]; drain: DrainSummary | null };

export function analyseDriving(input: DriveInputs, now: number): Driving {
  return { drives: buildDrives(input), drain: drainSummary(parkedDrain(input, now)) };
}
