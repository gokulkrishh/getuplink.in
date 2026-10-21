import { dailyDistance, istDay, istDayStart, num, type Reading, type UpdateTimeline } from "@/lib/telemetry-derive";

// Pure builders for the dashboard's "This week", battery chart and "Recent activity". The loader in
// lib/server/dashboard-extras.ts reads the data (or the demo's generated data) and passes it through these.

export const WEEK_DAYS = 7;
export const ACTIVITY_DAYS = 14;
// Below this a day's or week's distance is too short for Wh/km to mean anything.
export const MIN_EFFICIENCY_KM = 10;

// A counter's increase per IST day: the day's last reading minus the last reading before it that exists
// (`before` is the last reading from before the window). Days without a reading are null.
export function dailyIncrease(readings: Reading[], before: number | null, now: number, days: number): (number | null)[] {
  const lastOfDay = new Map<number, number>();
  for (const r of readings) {
    const value = num(r.value);
    if (value !== null) lastOfDay.set(istDay(Date.parse(r.at)), value);
  }
  const today = istDay(now);
  let previous = before;
  const result: (number | null)[] = [];
  for (let day = today - days + 1; day <= today; day++) {
    const value = lastOfDay.get(day);
    if (value === undefined) {
      result.push(null);
      continue;
    }
    result.push(previous !== null ? Math.max(0, value - previous) : null);
    previous = value;
  }
  return result;
}

// The charge sessions the dashboard counts: a Tesla session and the car's own record of it count once.
export type ChargeItem = {
  started_at: string;
  energyKwh: number | null;
  // Tesla Supercharger sessions only.
  place: string | null;
  cost: number | null;
  currency: string | null;
  startLevel: number | null;
  endLevel: number | null;
};

export type WeekSummary = {
  km: number | null;
  usedKwh: number | null;
  chargedKwh: number | null;
  whPerKm: number | null;
};

// The last 7 IST days (today included). Each figure is null when there is no data for it.
export function weekSummary(odometer: Reading[], odometerBefore: number | null, used: Reading[], usedBefore: number | null, charges: ChargeItem[], now: number): WeekSummary {
  const days = dailyDistance(odometer, odometerBefore, now, WEEK_DAYS);
  const known = days.filter((d) => d.km !== null);
  const km = known.length > 0 ? known.reduce((sum, d) => sum + (d.km ?? 0), 0) : null;
  const increases = dailyIncrease(used, usedBefore, now, WEEK_DAYS).filter((v): v is number => v !== null);
  const usedKwh = increases.length > 0 ? increases.reduce((a, b) => a + b, 0) : null;
  const from = istDayStart(istDay(now) - WEEK_DAYS + 1);
  const energies = charges.filter((c) => Date.parse(c.started_at) >= from && c.energyKwh !== null);
  const chargedKwh = energies.length > 0 ? energies.reduce((sum, c) => sum + (c.energyKwh ?? 0), 0) : null;
  const whPerKm = km !== null && km >= MIN_EFFICIENCY_KM && usedKwh !== null && usedKwh > 0 ? (usedKwh * 1000) / km : null;
  return { km, usedKwh, chargedKwh, whPerKm };
}

export type ActivityEvent = { at: number; text: string };

export type ActivityInput = {
  odometer: Reading[];
  odometerBefore: number | null;
  used: Reading[];
  usedBefore: number | null;
  charges: ChargeItem[];
  updates: { version: string; detected_at: string; timeline?: UpdateTimeline }[];
  now: number;
  limit?: number;
};

const kwh = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)} kWh`;
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function chargeText(c: ChargeItem): string {
  const energy = c.energyKwh !== null ? kwh(c.energyKwh) : null;
  if (c.place !== null) {
    const cost = c.cost !== null ? (c.currency && c.currency !== "INR" ? `${c.currency} ${c.cost.toFixed(2)}` : rupees.format(c.cost)) : null;
    return [`Supercharged${energy ? ` ${energy}` : ""} at ${c.place}`, cost].filter(Boolean).join(" · ");
  }
  const levels = c.startLevel !== null && c.endLevel !== null ? `${Math.round(c.startLevel)}% to ${Math.round(c.endLevel)}%` : null;
  return `Charged${energy ? ` ${energy}` : ""}${levels ? `${energy ? "," : ""} ${levels}` : ""}`;
}

// Up to `limit` newest events from the last 14 IST days: one entry per day driven, each charge and each
// update. Newest first.
export function buildActivity(input: ActivityInput): ActivityEvent[] {
  const { now, limit = 6 } = input;
  const from = istDayStart(istDay(now) - ACTIVITY_DAYS + 1);
  const events: ActivityEvent[] = [];

  // Drives: one entry per day, dated by the day's last odometer reading.
  const distance = dailyDistance(input.odometer, input.odometerBefore, now, ACTIVITY_DAYS);
  const energy = dailyIncrease(input.used, input.usedBefore, now, ACTIVITY_DAYS);
  const lastAt = new Map<number, number>();
  for (const r of input.odometer) lastAt.set(istDay(Date.parse(r.at)), Date.parse(r.at));
  distance.forEach((d, i) => {
    if (d.km === null || d.km < 1) return;
    const wh = energy[i];
    const eff = d.km >= MIN_EFFICIENCY_KM && wh !== null && wh > 0 ? ` · ${Math.round((wh * 1000) / d.km)} Wh/km` : "";
    events.push({ at: lastAt.get(d.day) ?? d.start, text: `Drove ${d.km} km${eff}` });
  });

  for (const c of input.charges) {
    const at = Date.parse(c.started_at);
    if (at >= from) events.push({ at, text: chargeText(c) });
  }
  for (const u of input.updates) {
    const at = Date.parse(u.detected_at);
    if (at < from) continue;
    const took = u.timeline?.installMin !== undefined ? ` · took ${u.timeline.installMin} min` : "";
    events.push({ at, text: `Installed ${u.version}${took}` });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

export type LevelPoint = { at: number; level: number };

// BatteryLevel readings thinned to the last reading in each bucket, so a week of readings stays small.
export function levelSeries(readings: Reading[], from: number, bucketMs: number): LevelPoint[] {
  const buckets = new Map<number, LevelPoint>();
  for (const r of readings) {
    const at = Date.parse(r.at);
    const level = num(r.value);
    if (level !== null && at >= from) buckets.set(Math.floor(at / bucketMs), { at, level });
  }
  return [...buckets.values()].sort((a, b) => a.at - b.at);
}
