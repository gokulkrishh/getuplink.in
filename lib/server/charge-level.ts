import "server-only";
import { type ChargeLevel, chargingStretches, levelPoints, weeklyFullRange, type WeeklyRange } from "@/lib/charge-level";
import type { Reading } from "@/lib/telemetry-derive";
import { trendWindow } from "./battery";

export const LEVEL_DAYS = 30;
const SLOT_MS = 30 * 60_000;

const since = (readings: Reading[], from: number) => readings.filter((r) => Date.parse(r.at) >= from);

// Battery level for the last 30 days, a point per half hour, and when the car was charging, from the
// window's readings (see loadWindowStats).
export function chargeLevel(level: Reading[], states: Reading[], now: number): ChargeLevel {
  const from = now - LEVEL_DAYS * 86_400_000;
  return { from, points: levelPoints(since(level, from), SLOT_MS), charging: chargingStretches(since(states, from), now) };
}

// Rated range at 100% for each of the battery trend's 12 IST weeks that have one.
export function fullRange(range: Reading[], level: Reading[], now: number): WeeklyRange[] {
  const { from } = trendWindow(now);
  return weeklyFullRange(since(range, from), since(level, from));
}
