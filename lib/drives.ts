// Drives and parked drain rebuilt from Fleet Telemetry readings. Pure (no database), so it can be tested
// with a script; lib/server/driving.ts does the reading.
//
// Battery level, energy and range are streamed on change, at most every 5 minutes, so the reading in force
// when a drive starts or ends can be minutes old: taken mid-charge, or while still driving. levelAtStart and
// levelAtEnd pick the readings that belong to the drive, and give none when no reading can be trusted.
import { MILES_TO_KM } from "@/lib/car";
import { istDay, istDayStart, median, num, type Reading } from "@/lib/telemetry-derive";

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
  kwh: number | null; // EnergyRemaining at the start minus at the end
  whPerKm: number | null; // only for drives of at least 1 km
  startLevel: number | null;
  endLevel: number | null;
  rangeKm?: number | null; // rated range used
  chargedBefore?: boolean; // a charge ran between the previous drive and this one
  // The drive's km in each IST hour it ran through, by the hour's start: the odometer's last reading
  // before each hour boundary splits it, as the hourly bars read the counter. They add up to km.
  hourKm?: HourKm[];
};

export type HourKm = { from: number; km: number };

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
// The odometer can arrive a little after the gear; it doesn't change while parked.
const LOOKAHEAD_MS = 10 * MIN;
// A level read this close before a charge ended is the level it ended at.
export const CHARGE_END_SLACK_MS = MIN;
// The first level read this soon after parking is where the drive left the battery.
export const SETTLE_MS = 5 * MIN;

export type Point = { t: number; v: number };

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
type Charges = [number, number][];

// The level (battery, energy or range) a drive started at: the last reading before the start, unless a
// charge ended after it was taken (it shows a level the charge went past) or the first reading inside the
// drive is higher (a change the car hadn't reported yet). Then the first reading inside the drive. Null
// with neither.
export function levelAtStart(points: Point[], trip: Trip, charging: Charges): Point | null {
  // A reading at the start instant came with the first non-P gear, so the car was already moving: like the
  // odometer, the start level is the reading before it.
  const prev = points.findLast((p) => p.t < trip.start) ?? null;
  const inside = points.find((p) => p.t >= trip.start && p.t <= trip.end) ?? null;
  const charged = prev !== null && charging.some(([a, b]) => a <= trip.start && b > prev.t + CHARGE_END_SLACK_MS);
  if (prev && !charged && !(inside && inside.v > prev.v)) return prev;
  return inside;
}

// The level a drive ended at: the first reading at or after park within SETTLE_MS (up to `limit`: the next
// drive or charge), unless it is higher than the last reading inside the drive (a charge began before the
// car said so). Otherwise the last reading inside the drive. Null with neither.
export function levelAtEnd(points: Point[], trip: Trip, limit: number): Point | null {
  const last = points.findLast((p) => p.t > trip.start && p.t < trip.end) ?? null;
  const until = Math.min(trip.end + SETTLE_MS, limit);
  const after = points.find((p) => p.t >= trip.end && p.t <= until) ?? null;
  if (after && !(last && after.v > last.v)) return after;
  return last;
}

// The start and end levels, or null when either is unknown or both are the same reading (nothing was seen
// to change).
function levels(points: Point[], trip: Trip, limit: number, charging: Charges): [number, number] | null {
  const a = levelAtStart(points, trip, charging);
  const b = levelAtEnd(points, trip, limit);
  return a && b && a.t < b.t ? [a.v, b.v] : null;
}

// The IST hour an instant falls in, by its start. Counted from the IST day's start: IST hours begin at
// half past a UTC hour, so rounding the instant down to a whole hour would be 30 minutes off.
export function istHourStart(t: number): number {
  const dayStart = istDayStart(istDay(t));
  return dayStart + Math.floor((t - dayStart) / HOUR) * HOUR;
}

// A drive's km in each IST hour from `start` to `until`, split at every hour boundary by the odometer's
// last reading before it (as counter_values_at reads it), kept between the drive's own first and last
// odometer values (miles) so the pieces add up to the drive's distance exactly.
export function hourKm(odometer: Point[], start: number, until: number, odoStart: number, odoEnd: number): HourKm[] {
  const pieces: HourKm[] = [];
  let from = istHourStart(start);
  let before = odoStart;
  for (let boundary = from + HOUR; boundary <= until; boundary += HOUR) {
    const at = Math.min(odoEnd, Math.max(before, valueAt(odometer, boundary - 1) ?? before));
    pieces.push({ from, km: (at - before) * MILES_TO_KM });
    before = at;
    from = boundary;
  }
  pieces.push({ from, km: (odoEnd - before) * MILES_TO_KM });
  return pieces.filter((p) => p.km > 0);
}

function describe(trip: Trip, nextStart: number, s: Series, charging: Charges): Drive | null {
  // The odometer is read up to a few minutes after the gear shows P, but never into the next drive.
  const settled = Math.min(trip.end + LOOKAHEAD_MS, nextStart - 1);
  // Gear and odometer arrive every few minutes, so the car is often already moving when the first
  // non-P gear is read. Counting from the last reading before it keeps that distance, and since the
  // previous drive's counters stop just short of this one, consecutive drives add up to the odometer.
  const odoStart = valueAt(s.odometer, trip.start - 1) ?? valueAt(s.odometer, trip.start);
  const odoEnd = valueAt(s.odometer, settled);
  if (odoStart === null || odoEnd === null) return null;
  const km = (odoEnd - odoStart) * MILES_TO_KM;
  if (km < MIN_DRIVE_KM) return null;
  // Levels after park stop at the next drive or charge.
  const limit = Math.min(nextStart - 1, ...charging.filter(([a]) => a >= trip.end).map(([a]) => a - 1));
  // Energy is EnergyRemaining's drop, not LifetimeEnergyUsed's rise: on real drives that counter rose 1.6
  // to 1.8 times what EnergyRemaining and the battery level both lost (while parked the three agree).
  const energy = levels(s.energy, trip, limit, charging);
  const kwh = energy && energy[0] >= energy[1] ? energy[0] - energy[1] : null;
  const battery = levels(s.battery, trip, limit, charging);
  const range = levels(s.range, trip, limit, charging);
  return {
    start: trip.start,
    end: trip.end,
    km,
    hourKm: hourKm(s.odometer, trip.start, settled, odoStart, odoEnd),
    kwh,
    whPerKm: kwh !== null && km >= 1 ? (kwh * 1000) / km : null,
    startLevel: battery?.[0] ?? null,
    endLevel: battery?.[1] ?? null,
    rangeKm: range && range[0] >= range[1] ? (range[0] - range[1]) * MILES_TO_KM : null,
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
// chargedBefore: a charge ran between the previous drive and this one.
export function buildDrives(input: DriveInputs): Drive[] {
  const trips = findTrips(input.gear);
  const s = series(input);
  const charging = chargeRanges(input.charge);
  const drives: Drive[] = [];
  trips.forEach((trip, i) => {
    const drive = describe(trip, trips[i + 1]?.start ?? Infinity, s, charging);
    if (!drive) return;
    const prevEnd = drives.at(-1)?.end;
    if (prevEnd !== undefined && charging.some(([a, b]) => a < trip.start && b > prevEnd)) drive.chargedBefore = true;
    drives.push(drive);
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

// How a parked stretch began: a drive ended or a charge did.
type ParkFrom = "drive" | "charge";

// The level a parked stretch began at. After a drive: the first reading within SETTLE_MS of parking,
// otherwise the last one before (taken while driving), otherwise the first after. After a charge: the
// first reading from just before it ended on, since any earlier one was taken mid-charge. Null with none
// before `end`.
export function levelAtPark(points: Point[], start: number, end: number, from: ParkFrom): number | null {
  const firstFrom = (t: number) => points.find((p) => p.t >= t && p.t < end)?.v ?? null;
  if (from === "charge") return firstFrom(start - CHARGE_END_SLACK_MS);
  const settled = points.find((p) => p.t >= start && p.t <= Math.min(start + SETTLE_MS, end));
  return settled?.v ?? valueAt(points, start) ?? firstFrom(start);
}

function parkStats(s: Series, times: number[], start: number, end: number, from: ParkFrom): ParkStats {
  const hours = (end - start) / HOUR;
  const drop = (points: Point[]) => {
    const a = levelAtPark(points, start, end, from);
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
    const pieces: [number, number, ParkFrom][] = [];
    let cursor = from;
    let kind: ParkFrom = "drive";
    for (const [a, b] of charging) {
      if (b <= cursor) continue;
      if (a >= to) break;
      if (a > cursor) pieces.push([cursor, a, kind]);
      cursor = Math.max(cursor, b);
      kind = "charge";
    }
    if (cursor < to) pieces.push([cursor, to, kind]);
    for (const [start, end, kind] of pieces) {
      if (end - start < MIN_PARKED_MS || end < now - DRAIN_DAYS * DAY) continue;
      const stats = parkStats(s, times, start, end, kind);
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
  let from: ParkFrom = "drive";
  for (const [, b] of charges) {
    if (b > start && b <= latest.t) {
      start = b;
      fromFirstReading = false;
      from = "charge";
    }
  }
  if (latest.t <= start) return null;
  return { ...parkStats(s, readingTimes(input), start, latest.t, from), fromFirstReading };
}

// parked: every qualifying stretch, oldest first; drain: their median once there are two.
export type Driving = { drives: Drive[]; drain: DrainSummary | null; parked: ParkedPeriod[]; parkedNow: ParkedNow | null };

export function analyseDriving(input: DriveInputs, now: number): Driving {
  const parked = parkedDrain(input, now);
  return { drives: buildDrives(input), drain: drainSummary(parked), parked, parkedNow: parkedNow(input) };
}
