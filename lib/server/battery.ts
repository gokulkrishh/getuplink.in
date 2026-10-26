import "server-only";
import { energyPoints, istWeek, istWeekStart, type Reading, type WeeklyPack, weeklyUsable } from "@/lib/telemetry-derive";

const WEEKS = 12;

// The last 12 IST weeks, this one included, as instants.
export function trendWindow(now: number): { from: number; to: number } {
  const current = istWeek(now);
  return { from: istWeekStart(current - WEEKS + 1), to: istWeekStart(current + 1) };
}

// Usable capacity for each of the last 12 IST weeks that have one (see weeklyUsable), from EnergyRemaining
// and BatteryLevel readings that cover at least those weeks (see loadWindowStats).
export function batteryTrend(energy: Reading[], level: Reading[], now: number): WeeklyPack[] {
  const { from, to } = trendWindow(now);
  const inWeeks = (r: Reading) => {
    const t = Date.parse(r.at);
    return t >= from && t < to;
  };
  return weeklyUsable(energyPoints(energy.filter(inWeeks), level.filter(inWeeks)));
}
