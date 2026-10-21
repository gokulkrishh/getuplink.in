import { dailyDistance, istDay, istDayStart, num, type Reading, type UpdateTimeline } from "@/lib/telemetry-derive";

// Pure builders for the dashboard's "This week" and "Recent activity". The loader in
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

export type WeekTotals = { km: number | null; whPerKm: number | null };

// The last 7 IST days (today included) and the 7 days before them.
export type WeekSummary = WeekTotals & { previous: WeekTotals };

// Each figure is null when there is no data for it.
export function weekSummary(odometer: Reading[], odometerBefore: number | null, used: Reading[], usedBefore: number | null, now: number): WeekSummary {
  const span = WEEK_DAYS * 2;
  const km = dailyDistance(odometer, odometerBefore, now, span).map((d) => d.km);
  const usedKwh = dailyIncrease(used, usedBefore, now, span);
  const sum = (values: (number | null)[]): number | null => {
    const known = values.filter((v): v is number => v !== null);
    return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  };
  const totals = (from: number): WeekTotals => {
    const weekKm = sum(km.slice(from, from + WEEK_DAYS));
    const weekUsed = sum(usedKwh.slice(from, from + WEEK_DAYS));
    const whPerKm = weekKm !== null && weekKm >= MIN_EFFICIENCY_KM && weekUsed !== null && weekUsed > 0 ? (weekUsed * 1000) / weekKm : null;
    return { km: weekKm, whPerKm };
  };
  return { ...totals(WEEK_DAYS), previous: totals(0) };
}

export type Comparison = { text: string; tone: "better" | "worse" | "neutral" };

// "18 km more than last week", "Same" (within 2%). `lowerIsBetter` words the change as
// better or worse (tone better or worse) instead of less or more (tone neutral). Null when last week has no figure.
export function compareToLastWeek(current: number, previous: number | null, unit: string, opts: { decimals?: number; lowerIsBetter?: boolean } = {}): Comparison | null {
  if (previous === null) return null;
  const { decimals = 0, lowerIsBetter = false } = opts;
  const diff = current - previous;
  const step = 10 ** -decimals;
  const rounded = Math.round(Math.abs(diff) / step) * step;
  if (rounded === 0 || Math.abs(diff) <= Math.abs(previous) * 0.02) return { text: "Same", tone: "neutral" };
  const up = diff > 0;
  const word = lowerIsBetter ? (up ? "worse" : "better") : up ? "more" : "less";
  const tone = lowerIsBetter ? (up ? "worse" : "better") : "neutral";
  return { text: `${rounded.toFixed(decimals)} ${unit} ${word}`, tone };
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
  const { now, limit = 30 } = input;
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

