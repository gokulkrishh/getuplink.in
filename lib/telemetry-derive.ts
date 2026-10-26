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

// Typical AC power over a session: the power it drew for the middle of its charging time (a median by
// time, ramp-up and closing zeros skipped). The car sends power only when it changes, so each reading holds
// until the next one or `end`; counting readings instead let a few minutes of taper outvote hours of steady
// draw. Null when no reading drew power for any time.
export function typicalChargeKw(readings: Reading[], end: number): number | null {
  const sorted = readings
    .map((r) => ({ t: Date.parse(r.at), kw: num(r.value) }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);
  const held: { kw: number; ms: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const { kw, t } = sorted[i];
    const ms = Math.min(i + 1 < sorted.length ? sorted[i + 1].t : end, end) - t;
    if (kw !== null && kw > 0.5 && ms > 0) held.push({ kw, ms });
  }
  if (held.length === 0) return null;
  held.sort((a, b) => a.kw - b.kw);
  const half = held.reduce((sum, h) => sum + h.ms, 0) / 2;
  let sum = 0;
  for (const h of held) {
    sum += h.ms;
    if (sum >= half) return h.kw;
  }
  return held[held.length - 1].kw;
}

// Below this the estimate swings with small rounding in the reported level, so those readings are skipped.
export const MIN_LEVEL = 20;

export type PackEstimate = { at: string; kwh: number };

// The car sends battery level and energy left every 5 minutes. Most of the time they share a timestamp,
// but after a charge they can drift apart (on 25 Oct 2026 energy came at :x0:52, level at :x2:59), and
// mid-charge the level climbs about 4 points in those 5 minutes. Even a straight line between the level
// readings either side misses by half a point where a charge starts or stops (21:25:52 and 21:55:52 that
// night). So the level at a reading is the level reading at that instant, else the line between the ones
// either side only when they agree within STEADY_LEVEL points: the car was still, and the level is known to
// within that. Mid-charge and mid-drive readings at other instants are left unpaired.
export const STEADY_LEVEL = 0.5;

type LevelReading = { ms: number; pct: number };

export function levelAt(levels: LevelReading[], ms: number): number | null {
  // The first reading at or after ms (levels are oldest first).
  let lo = 0;
  let hi = levels.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (levels[mid].ms < ms) lo = mid + 1;
    else hi = mid;
  }
  const after = levels[lo];
  if (after && after.ms === ms) return after.pct;
  const before = levels[lo - 1];
  if (!before || !after) return null;
  if (Math.abs(after.pct - before.pct) > STEADY_LEVEL) return null;
  return before.pct + ((after.pct - before.pct) * (ms - before.ms)) / (after.ms - before.ms);
}

// Each reading with the battery level at its time, when that is known (see levelAt) and at least
// MIN_LEVEL. `level` is a percentage.
export type WithLevel = { at: string; value: number; level: number };

export function withLevel(readings: Reading[], level: Reading[]): WithLevel[] {
  const levels = level
    .flatMap((r) => {
      const pct = num(r.value);
      const ms = Date.parse(r.at);
      return pct !== null && Number.isFinite(ms) ? [{ ms, pct }] : [];
    })
    .sort((a, b) => a.ms - b.ms);
  return readings.flatMap((r) => {
    const value = num(r.value);
    const pct = value === null ? null : levelAt(levels, Date.parse(r.at));
    return value !== null && pct !== null && pct >= MIN_LEVEL ? [{ at: r.at, value, level: pct }] : [];
  });
}

// Energy left against battery level.
export type EnergyPoint = { at: string; kwh: number; level: number };

export const energyPoints = (energy: Reading[], level: Reading[]): EnergyPoint[] =>
  withLevel(energy, level).map(({ at, value, level }) => ({ at, kwh: value, level }));

export const roundKwh = (kwh: number) => Math.round(kwh * 10) / 10;

export type WeeklyPack = { weekStart: number; kwh: number; readings: number };

// IST weeks start on Monday. 1970-01-01 was a Thursday, so shifting by 3 days aligns the weeks.
export const istWeek = (ms: number) => Math.floor((istDay(ms) + 3) / 7);
export const istWeekStart = (week: number) => istDayStart(week * 7 - 3);

// Energy left isn't level × capacity: the car counts a reserve below 0% in it. Its readings sit on a
// straight line, energy = reserve + usable × level (from 46% to 70% on this car: 2.97 kWh + 59.12 kWh ×
// level, r² 0.9994), so energy ÷ level read 64.2 kWh at 61% and 65.5 kWh at 46% in the same week. The
// usable capacity is that line's slope: the kWh between 0% and 100%. Energy left moves in 0.12 kWh steps,
// so a slope over few levels is loose: 13 readings over 11 points (26 Oct 2026) gave 58.5 kWh against
// 59.0 from 90 over 24 the week before, which "vs best week" would show as a 0.8% loss. A week needs
// MIN_POINTS readings whose levels span MIN_SPAN points, or it has no figure.
export const MIN_SPAN = 15;
export const MIN_POINTS = 6;

export function usableKwh(points: EnergyPoint[]): number | null {
  if (points.length < MIN_POINTS) return null;
  const xs = points.map((p) => p.level / 100);
  if ((Math.max(...xs) - Math.min(...xs)) * 100 < MIN_SPAN) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.kwh, 0) / points.length;
  let sxy = 0;
  let sxx = 0;
  points.forEach((p, k) => {
    sxy += (xs[k] - mx) * (p.kwh - my);
    sxx += (xs[k] - mx) ** 2;
  });
  const slope = sxy / sxx;
  return slope > 0 ? slope : null;
}

// Usable capacity per IST week (see usableKwh), oldest week first. Weeks without one are left out.
export function weeklyUsable(points: EnergyPoint[]): WeeklyPack[] {
  const byWeek = new Map<number, EnergyPoint[]>();
  for (const p of points) {
    const week = istWeek(Date.parse(p.at));
    byWeek.set(week, [...(byWeek.get(week) ?? []), p]);
  }
  return [...byWeek]
    .sort(([a], [b]) => a - b)
    .flatMap(([week, values]) => {
      const kwh = usableKwh(values);
      return kwh === null ? [] : [{ weekStart: istWeekStart(week), kwh: roundKwh(kwh), readings: values.length }];
    });
}

// Median value per IST week, oldest week first. Weeks without values are left out.
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

// `started` is SoftwareUpdateInProgress; it's optional because the car only began streaming it on 23 Oct 2026.
export type UpdateSeries = { pending: Reading[]; download: Reading[]; install: Reading[]; installed: Reading[]; started?: Reading[] };
export type UpdateTimeline = { downloadMin?: number; installMin?: number };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// How long one update took, from the readings around it. Only the parts the readings can prove are returned.
// Download: first percent above 0 to first 100, while the version was pending. Install: from the first
// SoftwareUpdateInProgress true after the download (or while pending, if the download wasn't seen) to the
// Version reading that shows the new version. The car prepares an update in the background long before it
// installs (the installation percent climbed to 10% at midnight for an install started at 7:42 AM), so the
// percent only stands in for the start when InProgress wasn't streamed: the first above the idle placeholder (1).
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
  const afterDownload = (ms: number) => (downloadEnd !== null ? ms >= downloadEnd : pendingAt(ms) === target);
  const started = series.started?.find((r) => r.value === true && afterDownload(Date.parse(r.at)));
  const installStart = started ? Date.parse(started.at) : first(series.install, (p, ms) => p > 1 && afterDownload(ms));
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
export type UpdateRow = { detected_at: string; available_at: string | null };
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
