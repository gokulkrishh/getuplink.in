import { MILES_TO_KM } from "@/lib/car";

// Pure helpers over streamed Fleet Telemetry readings (rows from telemetry_readings, oldest first).
export type Reading = { at: string; value: unknown };

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

// Days since 1970-01-01 in IST, and the start of such a day as a UTC instant.
export const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
export const istDayStart = (day: number) => day * DAY_MS - IST_OFFSET_MS;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Typical AC power over a session: the median of readings while drawing power (ramp-up and closing
// zeros skipped). Null with fewer than 3 such readings.
export function typicalChargeKw(readings: Reading[]): number | null {
  const kws = readings.map((r) => num(r.value)).filter((kw): kw is number => kw !== null && kw > 0.5);
  return kws.length >= 3 ? median(kws) : null;
}

// Below this the estimate swings with small rounding in the reported level, so those readings are skipped.
export const MIN_LEVEL = 20;

export type PackEstimate = { at: string; kwh: number };

// Estimated full pack per energy reading: kWh remaining ÷ battery level, using only readings the car
// sent together (same timestamp) and a level of at least MIN_LEVEL.
export function packEstimates(energy: Reading[], level: Reading[]): PackEstimate[] {
  const levels = new Map(level.map((r) => [Date.parse(r.at), num(r.value)]));
  const estimates: PackEstimate[] = [];
  for (const r of energy) {
    const kwh = num(r.value);
    const pct = levels.get(Date.parse(r.at));
    if (kwh !== null && pct != null && pct >= MIN_LEVEL) estimates.push({ at: r.at, kwh: kwh / (pct / 100) });
  }
  return estimates;
}

export const roundKwh = (kwh: number) => Math.round(kwh * 10) / 10;

export type WeeklyPack = { weekStart: number; kwh: number; readings: number };

// IST weeks start on Monday. 1970-01-01 was a Thursday, so shifting by 3 days aligns the weeks.
export const istWeek = (ms: number) => Math.floor((istDay(ms) + 3) / 7);
export const istWeekStart = (week: number) => istDayStart(week * 7 - 3);

// Median estimate per IST week, oldest week first. Weeks without estimates are left out.
export function weeklyPack(estimates: PackEstimate[]): WeeklyPack[] {
  const byWeek = new Map<number, number[]>();
  for (const e of estimates) {
    const week = istWeek(Date.parse(e.at));
    byWeek.set(week, [...(byWeek.get(week) ?? []), e.kwh]);
  }
  return [...byWeek]
    .sort(([a], [b]) => a - b)
    .map(([week, values]) => ({ weekStart: istWeekStart(week), kwh: roundKwh(median(values)), readings: values.length }));
}

// Kilometres per IST day: the day's last odometer reading minus the last reading of the day before that
// has one. A day without a reading is 0 once any reading exists; before the first reading it is null (blank).
// `before` is the last reading (miles) from before the window, so the first day has something to count from.
export type DayKm = { day: number; start: number; km: number | null };

export function dailyDistance(readings: Reading[], before: number | null, now: number, days: number): DayKm[] {
  const lastOfDay = new Map<number, number>();
  for (const r of readings) {
    const miles = num(r.value);
    if (miles !== null) lastOfDay.set(istDay(Date.parse(r.at)), miles);
  }
  const today = istDay(now);
  let previous = before;
  const result: DayKm[] = [];
  for (let day = today - days + 1; day <= today; day++) {
    const miles = lastOfDay.get(day);
    let km: number | null = null;
    if (miles !== undefined) {
      if (previous !== null) km = Math.max(0, Math.round((miles - previous) * MILES_TO_KM));
      previous = miles;
    } else if (previous !== null) {
      km = 0;
    }
    result.push({ day, start: istDayStart(day), km });
  }
  return result;
}

export type UpdateSeries = { pending: Reading[]; download: Reading[]; install: Reading[]; installed: Reading[] };
export type UpdateTimeline = { downloadMin?: number; installMin?: number };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// How long one update took, from the readings around it. Only the parts the readings can prove are returned.
// Download: first percent above 0 to first 100, while the version was pending. Install: first installation
// percent above the idle placeholder (1), after the download (or while pending, if the download wasn't seen), to the Version reading that shows the new version.
export function updateTimeline(version: string, series: UpdateSeries): UpdateTimeline | null {
  const target = version.trim();
  // The pending version in force at an instant (readings in one record share a timestamp, so equal counts).
  const pendingAt = (ms: number) => {
    let current = "";
    for (const r of series.pending) {
      if (Date.parse(r.at) > ms) break;
      current = text(r.value);
    }
    return current;
  };
  const first = (readings: Reading[], test: (percent: number, ms: number) => boolean) => {
    for (const r of readings) {
      const percent = num(r.value);
      const ms = Date.parse(r.at);
      if (percent !== null && test(percent, ms)) return ms;
    }
    return null;
  };
  const downloadStart = first(series.download, (p, ms) => p > 0 && pendingAt(ms) === target);
  const downloadEnd =
    downloadStart === null ? null : first(series.download, (p, ms) => p >= 100 && ms >= downloadStart && pendingAt(ms) === target);
  const installStart = first(series.install, (p, ms) =>
    p > 1 && (downloadEnd !== null ? ms >= downloadEnd : pendingAt(ms) === target),
  );
  let installEnd: number | null = null;
  if (installStart !== null) {
    for (const r of series.installed) {
      const ms = Date.parse(r.at);
      if (ms > installStart && text(r.value) === target) {
        installEnd = ms;
        break;
      }
    }
  }
  const minutes = (from: number | null, to: number | null) => (from !== null && to !== null && to > from ? Math.max(1, Math.round((to - from) / 60_000)) : undefined);
  const downloadMin = minutes(downloadStart, downloadEnd);
  const installMin = minutes(installStart, installEnd);
  return downloadMin === undefined && installMin === undefined ? null : { ...(downloadMin !== undefined && { downloadMin }), ...(installMin !== undefined && { installMin }) };
}

// Below this a month is too short a drive for the figure to mean anything.
export const MIN_ENERGY_KM = 50;

// Real updates only (not the version that was already installed when tracking began), as the gaps the
// Updates section needs. `rows` is any order; `now` closes the open gap on the current version.
export type UpdateRow = { detected_at: string; available_at: string | null; source: "tracked" | "imported" };
export type UpdateStats = { count: number; avgWaitSec: number | null; avgGapSec: number; longestSec: number };

export function updateStats(rows: UpdateRow[], now: number): UpdateStats | null {
  const times = rows.map((r) => Date.parse(r.detected_at)).sort((a, b) => a - b);
  if (times.length < 2) return null;
  const gaps = times.slice(1).map((t, k) => (t - times[k]) / 1000);
  const waits = rows.flatMap((r) => {
    const wait = r.available_at ? (Date.parse(r.detected_at) - Date.parse(r.available_at)) / 1000 : NaN;
    return Number.isFinite(wait) && wait >= 0 ? [wait] : [];
  });
  const open = Math.max(0, (now - times[times.length - 1]) / 1000);
  return {
    count: times.length,
    avgWaitSec: waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    avgGapSec: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    longestSec: Math.max(open, ...gaps),
  };
}
