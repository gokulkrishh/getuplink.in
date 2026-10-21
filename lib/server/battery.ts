import "server-only";
import { istWeek, istWeekStart, packEstimates, type PackEstimate, type WeeklyPack, weeklyPack } from "@/lib/telemetry-derive";
import { loadPrimaryVin, loadReadings } from "./telemetry";

// Pack estimates (see packEstimates) from the readings in a window. Null when the readings can't be read.
export async function loadPackEstimates(vin: string, from: string, to?: string): Promise<PackEstimate[] | null> {
  const [energy, level] = await Promise.all([loadReadings(vin, "EnergyRemaining", from, to), loadReadings(vin, "BatteryLevel", from, to)]);
  return energy && level ? packEstimates(energy, level) : null;
}

const WEEKS = 12;

// Median full-pack estimate for each of the last 12 IST weeks that have one. Each week is its own window,
// so a busy week can't use up the row budget of a quiet one; the windows are queried together.
export async function loadBatteryTrend(): Promise<WeeklyPack[]> {
  const vin = await loadPrimaryVin();
  if (!vin) return [];
  const current = istWeek(Date.now());
  const windows = await Promise.all(
    Array.from({ length: WEEKS }, (_, k) => {
      const week = current - WEEKS + 1 + k;
      return loadPackEstimates(vin, new Date(istWeekStart(week)).toISOString(), new Date(istWeekStart(week + 1)).toISOString());
    }),
  );
  return weeklyPack(windows.flatMap((w) => w ?? []));
}
