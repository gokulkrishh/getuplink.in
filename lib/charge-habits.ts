import { istDay } from "@/lib/telemetry-derive";

// When charging starts, by IST weekday and 3-hour slot, for the Charging page's heatmap. Pure, so it's
// tested directly.

const HOUR = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR;
export const SLOT_HOURS = 3;
export const SLOTS = 24 / SLOT_HOURS;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Monday is 0. 1970-01-01 was a Thursday, so day 0 is weekday 3.
export const istWeekday = (ms: number) => (istDay(ms) + 3) % 7;
export const istSlot = (ms: number) => Math.floor((((ms + IST_OFFSET_MS) % 86_400_000) / HOUR) / SLOT_HOURS);

// counts[weekday][slot]: charges started in each.
export function chargeStarts(starts: number[]): number[][] {
  const counts = WEEKDAYS.map(() => Array<number>(SLOTS).fill(0));
  for (const ms of starts) if (Number.isFinite(ms)) counts[istWeekday(ms)][istSlot(ms)]++;
  return counts;
}

// "6–9 PM", "9 PM–12 AM": the slot's hours, 12-hour like the rest of the app.
export function slotLabel(slot: number): string {
  const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;
  const [from, to] = [hour(slot * SLOT_HOURS), hour(slot * SLOT_HOURS + SLOT_HOURS)];
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)}–${to}` : `${from}–${to}`;
}
