// One charging session's power and battery level over time, from the readings streamed while it ran.
// Pure (no database); lib/server/charge-curve.ts does the reading.
import { nearestToEnd } from "@/lib/charge-sessions";
import { num, type Reading } from "@/lib/telemetry-derive";

export type CurvePoint = { t: number; kw: number | null; level: number | null };

export type ChargeCurve = {
  points: CurvePoint[]; // empty when there are too few readings to draw a line
  peakKw: number | null;
  avgKw: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
};

// Below this many readings the line says nothing the numbers don't.
const MIN_POINTS = 6;

type Sample = { t: number; v: number };

function samples(readings: Reading[]): Sample[] {
  return readings
    .map((r) => ({ t: Date.parse(r.at), v: num(r.value) }))
    .filter((s): s is Sample => s.v !== null && Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);
}

// The car sends a value only when it changes, so each reading holds until the next. The average is over
// the time spent drawing power, so the start-up and the tail at 0 kW don't pull it down.
function averageKw(power: Sample[], end: number): number | null {
  let kwMs = 0;
  let ms = 0;
  for (let i = 0; i < power.length; i++) {
    const span = (i + 1 < power.length ? power[i + 1].t : end) - power[i].t;
    if (power[i].v <= 0 || span <= 0) continue;
    kwMs += power[i].v * span;
    ms += span;
  }
  return ms > 0 ? kwMs / ms : null;
}

// One point per reading time, with the other series carried forward so both lines stay continuous.
function merge(power: Sample[], level: Sample[]): CurvePoint[] {
  const times = [...new Set([...power, ...level].map((s) => s.t))].sort((a, b) => a - b);
  const points: CurvePoint[] = [];
  let p = 0;
  let l = 0;
  let kw: number | null = null;
  let pct: number | null = null;
  for (const t of times) {
    while (p < power.length && power[p].t <= t) kw = power[p++].v;
    while (l < level.length && level[l].t <= t) pct = level[l++].v;
    points.push({ t, kw, level: pct });
  }
  return points;
}

// Readings from the start on. The car only sends a value when it changes, so a field that carries over
// is led by its last reading before the start, moved to the start.
export function fromStart(readings: Reading[], start: string, carry: boolean): Reading[] {
  const t0 = Date.parse(start);
  const during = readings.filter((r) => Date.parse(r.at) >= t0);
  const lead = carry ? readings.findLast((r) => Date.parse(r.at) < t0) : undefined;
  return lead ? [{ at: start, value: lead.value }, ...during] : during;
}

// Battery level readings up to the end, and the first one after it when the session's end level is that
// one (nearestToEnd, as buildSessions picks it). Kept at its own time, so the line ends where the figure does.
export function levelThroughEnd(readings: Reading[], end: number): Reading[] {
  const timed = readings.map((r) => ({ r, t: Date.parse(r.at) }));
  const upTo = timed.filter((x) => x.t <= end);
  const after = timed.find((x) => x.t > end) ?? null;
  const pick = nearestToEnd(upTo.at(-1) ?? null, after, end);
  return pick && pick === after ? [...upTo.map((x) => x.r), after.r] : upTo.map((x) => x.r);
}

// A session's peak and average power from its power readings, each held until the next (see averageKw).
// The peak is the session's own recorded one when it has it (`recordedPeakKw`), else the highest reading.
// The session page and the DC charging speed chart both use this, so their figures agree.
export function powerFigures(power: Reading[], end: number, recordedPeakKw: number | null = null): { peakKw: number | null; avgKw: number | null } {
  const s = samples(power);
  return { peakKw: recordedPeakKw ?? (s.length ? Math.max(...s.map((x) => x.v)) : null), avgKw: averageKw(s, end) };
}

// How often the DC curve samples a charge. Battery level comes every 5 minutes and power only when it
// changes, so pairing them reading by reading leaves most of a charge out.
const SAMPLE_MS = 60 * 1000;

// Battery level at t, on a straight line between the readings either side. Null outside the readings,
// where nothing is known.
function levelAt(level: Sample[], t: number): number | null {
  const k = level.findIndex((s) => s.t >= t);
  if (k === -1) return null;
  if (level[k].t === t) return level[k].v;
  if (k === 0) return null;
  const [a, b] = [level[k - 1], level[k]];
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

// One charge's power against battery level, for the DC charging speed chart. A sample every SAMPLE_MS from
// the first power reading up to the end, each with the power in force then (a reading holds until the
// next, as merge carries it on the session page) and the battery level between its readings. The session's
// start and end levels pin the level at the start and end, and bound it. `power` and `level` are read as
// the session page reads them (loadChargeSeries). Samples at 0 kW are left out, and nothing is drawn
// before the first power reading or past the end.
export function powerByLevel(input: { power: Reading[]; level: Reading[]; start: number; end: number; startLevel: number | null; endLevel: number | null }): { x: number; y: number }[] {
  const { start, end, startLevel, endLevel } = input;
  const power = samples(input.power).filter((s) => s.t >= start && s.t < end);
  if (power.length === 0) return [];
  let level = samples(input.level);
  if (startLevel !== null) level = [{ t: start, v: startLevel }, ...level.filter((s) => s.t > start)];
  if (endLevel !== null) level = [...level.filter((s) => s.t < end), { t: end, v: endLevel }];
  const ends = [startLevel, endLevel].filter((v): v is number => v !== null);
  const [low, high] = ends.length === 2 ? [Math.min(...ends), Math.max(...ends)] : [-Infinity, Infinity];
  const times = new Set(power.map((s) => s.t));
  for (let t = power[0].t; t < end; t += SAMPLE_MS) times.add(t);
  const points: { x: number; y: number }[] = [];
  let p = 0;
  let kw = 0;
  for (const t of [...times].sort((a, b) => a - b)) {
    while (p < power.length && power[p].t <= t) kw = power[p++].v;
    const pct = levelAt(level, t);
    if (kw > 0 && pct !== null) points.push({ x: Math.min(high, Math.max(low, pct)), y: kw });
  }
  return points.length >= 2 ? points : [];
}

export function chargeCurve(input: { power: Reading[]; level: Reading[]; tempMin: Reading[]; tempMax: Reading[]; end: number }): ChargeCurve {
  const power = samples(input.power);
  const level = samples(input.level);
  const points = merge(power, level);
  const { peakKw, avgKw } = powerFigures(input.power, input.end);
  const lows = samples(input.tempMin.length ? input.tempMin : input.tempMax).map((s) => s.v);
  const highs = samples(input.tempMax.length ? input.tempMax : input.tempMin).map((s) => s.v);
  return {
    points: points.length >= MIN_POINTS && power.length >= 2 ? points : [],
    peakKw,
    avgKw,
    tempMinC: lows.length ? Math.min(...lows) : null,
    tempMaxC: highs.length ? Math.max(...highs) : null,
  };
}
