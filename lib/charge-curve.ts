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

// Battery level readings up to the end, and the first one after it when the session's end level is that
// one (nearestToEnd, as buildSessions picks it). Kept at its own time, so the line ends where the figure does.
export function levelThroughEnd(readings: Reading[], end: number): Reading[] {
  const timed = readings.map((r) => ({ r, t: Date.parse(r.at) }));
  const upTo = timed.filter((x) => x.t <= end);
  const after = timed.find((x) => x.t > end) ?? null;
  const pick = nearestToEnd(upTo.at(-1) ?? null, after, end);
  return pick && pick === after ? [...upTo.map((x) => x.r), after.r] : upTo.map((x) => x.r);
}

export function chargeCurve(input: { power: Reading[]; level: Reading[]; tempMin: Reading[]; tempMax: Reading[]; end: number }): ChargeCurve {
  const power = samples(input.power);
  const level = samples(input.level);
  const points = merge(power, level);
  const lows = samples(input.tempMin.length ? input.tempMin : input.tempMax).map((s) => s.v);
  const highs = samples(input.tempMax.length ? input.tempMax : input.tempMin).map((s) => s.v);
  return {
    points: points.length >= MIN_POINTS && power.length >= 2 ? points : [],
    peakKw: power.length ? Math.max(...power.map((s) => s.v)) : null,
    avgKw: averageKw(power, input.end),
    tempMinC: lows.length ? Math.min(...lows) : null,
    tempMaxC: highs.length ? Math.max(...highs) : null,
  };
}
