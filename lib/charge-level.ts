import { MILES_TO_KM } from "@/lib/car";
import { chargeStateName } from "@/lib/charge-sessions";
import { istWeek, istWeekStart, median, MIN_LEVEL, num, type Reading } from "@/lib/telemetry-derive";

// Pure helpers for the Battery tab's charge level chart and range at 100%.

export type LevelPoint = { at: number; level: number };
export type ChargeStretch = { start: number; end: number };
export type ChargeLevel = { from: number; points: LevelPoint[]; charging: ChargeStretch[] };

// The last battery level in each slot, so a month of 5-minute readings stays a few hundred points.
// Slots without a reading are left out; the line joins the readings either side.
export function levelPoints(readings: Reading[], slotMs: number): LevelPoint[] {
  const bySlot = new Map<number, LevelPoint>();
  for (const r of readings) {
    const level = num(r.value);
    const at = Date.parse(r.at);
    // Kept raw and rounded once where shown: rounding to 0.1 first turned 60.49% into 61%, against
    // the 60% Tesla reports.
    if (level !== null) bySlot.set(Math.floor(at / slotMs), { at, level });
  }
  return [...bySlot.values()].sort((a, b) => a.at - b.at);
}

const CHARGING = new Set(["Starting", "Charging"]);

// When the car was charging, from DetailedChargeState. One still open at the end runs to `now`.
export function chargingStretches(states: Reading[], now: number): ChargeStretch[] {
  const stretches: ChargeStretch[] = [];
  let open: number | null = null;
  for (const r of states) {
    const charging = CHARGING.has(chargeStateName(r.value) ?? "");
    const at = Date.parse(r.at);
    if (charging && open === null) open = at;
    if (!charging && open !== null) {
      stretches.push({ start: open, end: at });
      open = null;
    }
  }
  if (open !== null) stretches.push({ start: open, end: now });
  return stretches;
}

export type WeeklyRange = { weekStart: number; km: number };

// Rated range at 100% per IST week: the median of rated range ÷ battery level, paired and filtered the
// same way as packEstimates. RatedRange arrives in miles.
export function weeklyFullRange(range: Reading[], level: Reading[]): WeeklyRange[] {
  const levels = new Map(level.map((r) => [Date.parse(r.at), num(r.value)]));
  const byWeek = new Map<number, number[]>();
  for (const r of range) {
    const miles = num(r.value);
    const pct = levels.get(Date.parse(r.at));
    if (miles === null || pct == null || pct < MIN_LEVEL) continue;
    const week = istWeek(Date.parse(r.at));
    byWeek.set(week, [...(byWeek.get(week) ?? []), (miles * MILES_TO_KM) / (pct / 100)]);
  }
  return [...byWeek].sort(([a], [b]) => a - b).map(([week, values]) => ({ weekStart: istWeekStart(week), km: Math.round(median(values)) }));
}
