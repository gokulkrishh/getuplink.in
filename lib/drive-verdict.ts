// What a drive's traces say, in words: how it went against the owner's own usual, and one sentence for each
// chart on the drive page. Pure, so the wording and thresholds are tested (test/drive-verdict.test.ts).
// Every sentence is built only from readings; nothing is projected or guessed.
import type { Drive } from "@/lib/drives";
import { formatClock, formatKm, formatKwh, formatLevels, formatNumber, formatPercent, formatSpeed } from "@/lib/format";
import { formatWhPerKm } from "@/lib/seasons";
import { median } from "@/lib/telemetry-derive";

export type Point = { t: number; v: number };

// A hard start or stop: the car's acceleration reached HARD_G either way. 0.3 g is a firm brake or a quick
// launch, about 11 km/h gained or lost in one second. The one place the threshold lives. It is Tesla's own
// line: its Safety Score counts hard braking as "backward acceleration, measured by your Tesla vehicle, in
// excess of 0.3g" (tesla.com/support/safety-score, read 31 Oct 2026), so Uplink marks what Tesla would.
// An owner asked on 31 Oct 2026 whether a stop they didn't feel as hard was regen: the readings showed the
// brake pedal pressed at every mark, 0.30 g to 0.41 g, past what regen alone gives (about 0.2 g). Kept at
// 0.3 g, with the Acceleration chart's ⓘ saying what a mark means.
export const HARD_G = 0.3;
export const HARD_MS2 = HARD_G * 9.81;
// Readings come one a second, so one brake is one moment, not several: hard readings the same way within
// HARD_GAP_MS of each other (a dip under the threshold mid-brake included) are the same moment.
const HARD_GAP_MS = 5_000;
// The owner's usual: the median of their other drives in the last USUAL_DAYS, once there are enough.
export const USUAL_DAYS = 30;
export const MIN_USUAL_DRIVES = 5;
// Within this much of the usual Wh/km, a drive reads "close to your usual", not better or worse.
const SAME_AS_USUAL = 0.03;
// Road grade within ±FLAT_GRADE throughout is flat. A climb or descent is a stretch at or beyond CLIMB_GRADE
// (up or down) that lasts MIN_SLOPE_MS; shorter ones are reading noise. A short dip under the grade
// (MERGE_DIP_MS or less, with no reading beyond the opposite grade) doesn't end a stretch, and at least
// STEEP_SHARE of the merged stretch's readings must be at the grade, so a chain of noise never counts.
// Time stands in for distance, which the grade readings don't carry.
export const FLAT_GRADE = 1;
export const CLIMB_GRADE = 2;
export const MIN_SLOPE_MS = 30_000;
const MERGE_DIP_MS = 15_000;
const STEEP_SHARE = 0.5;
// Power readings further apart than this are a gap (a stop), not one stretch.
const STRETCH_GAP_MS = 10_000;
const DAY = 86_400_000;

export type HardMoment = { t: number; v: number; kind: "start" | "brake" };

// The hard starts and brakes in an acceleration trace (m/s²), each a run of readings past HARD_MS2 the same
// way, no more than HARD_GAP_MS apart, kept at its peak.
export function hardMoments(accel: Point[]): HardMoment[] {
  const moments: (HardMoment & { last: number })[] = [];
  for (const p of accel) {
    if (Math.abs(p.v) < HARD_MS2) continue;
    const kind = p.v > 0 ? "start" : "brake";
    const open = moments.at(-1);
    if (open && open.kind === kind && p.t - open.last <= HARD_GAP_MS) {
      open.last = p.t;
      if (Math.abs(p.v) > Math.abs(open.v)) Object.assign(open, { t: p.t, v: p.v });
    } else moments.push({ t: p.t, v: p.v, kind, last: p.t });
  }
  return moments.map(({ last: _, ...m }) => m);
}

// The owner's other drives in the last USUAL_DAYS: not this one, and not before `since` (when the readings
// that are compared began, so a drive before them never counts as a 0).
function otherDrives(drives: Drive[], start: number, now: number, since: number | null = null): Drive[] {
  return drives.filter((d) => d.start !== start && d.start >= now - USUAL_DAYS * DAY && d.start <= now && (since === null || d.start >= since));
}

// The usual Wh/km: the median of the other drives with a figure, or null under MIN_USUAL_DRIVES.
export function usualWhPerKm(drives: Drive[], start: number, now: number): number | null {
  const values = otherDrives(drives, start, now).flatMap((d) => (d.whPerKm === null ? [] : [d.whPerKm]));
  return values.length >= MIN_USUAL_DRIVES ? median(values) : null;
}

// The usual number of hard moments in a drive: the median over the other drives since acceleration began
// streaming (`accelSince`), from `hard`, the readings at or past HARD_MS2 in the window. Null under
// MIN_USUAL_DRIVES, or before any acceleration reading.
export function usualHardMoments(hard: Point[], drives: Drive[], start: number, now: number, accelSince: number | null): number | null {
  if (accelSince === null) return null;
  const counts = otherDrives(drives, start, now, accelSince).map((d) => hardMoments(hard.filter((p) => p.t >= d.start && p.t <= d.end)).length);
  return counts.length >= MIN_USUAL_DRIVES ? median(counts) : null;
}

// "a", "a and b", "a, b and c", "a, b, c and 2 more".
function listWords(items: string[], most = 3): string {
  if (items.length <= 1) return items[0] ?? "";
  const shown = items.slice(0, most);
  const more = items.length - shown.length;
  return `${shown.slice(0, -1).join(", ")} and ${more > 0 ? `${shown.at(-1)}, and ${more} more` : shown.at(-1)}`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "1 hard brake and 2 hard starts": the moments counted, brakes first.
function hardCounts(moments: HardMoment[]): string {
  const brakes = moments.filter((m) => m.kind === "brake").length;
  const starts = moments.length - brakes;
  return [brakes > 0 && count(brakes, "hard brake"), starts > 0 && count(starts, "hard start")].filter(Boolean).join(" and ");
}

// A drive's Wh/km against the usual: better (lower), worse, or close (within SAME_AS_USUAL), and by how
// much, as shown ("5%"). Shared by the code sentence and the facts the AI writes from.
export function againstUsual(whPerKm: number, usual: number): { way: "better" | "worse" | "close"; by: string } {
  const diff = (usual - whPerKm) / usual;
  if (Math.abs(diff) < SAME_AS_USUAL) return { way: "close", by: formatPercent(Math.abs(diff) * 100) };
  return { way: diff > 0 ? "better" : "worse", by: formatPercent(Math.abs(diff) * 100) };
}

export type DriveVerdict = { efficiency: string | null; smoothness: string | null };

// How the drive went, in one or two sentences: its Wh/km against the usual, then how smooth it was. With
// no usual (fewer than MIN_USUAL_DRIVES other drives), facts only. `moments` is null when the car sent no
// acceleration.
export function driveVerdict({ whPerKm, usual, moments, usualHard }: { whPerKm: number | null; usual: number | null; moments: HardMoment[] | null; usualHard: number | null }): DriveVerdict {
  let efficiency: string | null = null;
  if (whPerKm !== null) {
    if (usual === null) efficiency = `${formatWhPerKm(whPerKm)}. Your usual shows after ${MIN_USUAL_DRIVES} drives.`;
    else {
      const { way, by } = againstUsual(whPerKm, usual);
      const against = `your usual ${formatWhPerKm(usual)}`;
      if (way === "close") efficiency = `Normal: ${formatWhPerKm(whPerKm)}, close to ${against}.`;
      else if (way === "better") efficiency = `Efficient: ${formatWhPerKm(whPerKm)}, ${by} better than ${against}.`;
      else efficiency = `Heavy: ${formatWhPerKm(whPerKm)}, ${by} worse than ${against}.`;
    }
  }
  let smoothness: string | null = null;
  if (moments !== null) {
    const n = moments.length;
    if (usualHard === null) smoothness = n === 0 ? "Smooth: no hard starts or stops." : `${hardCounts(moments)}.`;
    else {
      const against = `against your usual ${formatNumber(usualHard, 0)}`;
      if (n === 0) smoothness = `Smooth: no hard starts or stops, ${against}.`;
      else if (n <= usualHard) smoothness = `Smooth, with ${hardCounts(moments)} ${against}.`;
      else smoothness = `Rougher than usual: ${hardCounts(moments)} ${against}.`;
    }
  }
  return { efficiency, smoothness };
}

// "Top 62 km/h, mostly 30 to 45 km/h.": the top speed and the middle half of the readings while moving.
export function speedVerdict(speed: Point[]): string | null {
  const spread = speedSpread(speed);
  if (!spread) return null;
  return spread.mostly ? `Top ${spread.top}, mostly ${spread.mostly}.` : `Top ${spread.top}.`;
}

// The top speed and, with 10 or more readings while moving, the middle half of them ("30 to 45 km/h", or
// "40 km/h" when both ends read the same), as shown.
export function speedSpread(speed: Point[]): { top: string; mostly: string | null } | null {
  if (speed.length === 0) return null;
  const top = formatSpeed(Math.max(...speed.map((p) => p.v)));
  const moving = speed.map((p) => p.v).filter((v) => v > 0).sort((a, b) => a - b);
  if (moving.length < 10) return { top, mostly: null };
  const [low, high] = [moving[Math.floor(moving.length / 4)], moving[Math.floor((moving.length * 3) / 4)]];
  if (formatSpeed(low) === formatSpeed(high)) return { top, mostly: formatSpeed(low) };
  return { top, mostly: `${formatSpeed(low).replace(" km/h", "")} to ${formatSpeed(high)}` };
}

// Energy from a power trace (kW, one reading a second): each reading held until the next, within a leg and
// never across a gap. Approximate; the Energy used tile is the battery's own figure.
export function traceEnergy(power: Point[], legs?: { start: number; end: number }[]): { drawn: number; regen: number } {
  const leg = (t: number) => legs?.findIndex((l) => t >= l.start && t <= l.end) ?? 0;
  let drawn = 0;
  let regen = 0;
  for (let k = 0; k + 1 < power.length; k++) {
    const [a, b] = [power[k], power[k + 1]];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > STRETCH_GAP_MS || leg(a.t) !== leg(b.t)) continue;
    const kwh = (a.v * dt) / 3_600_000;
    if (kwh > 0) drawn += kwh;
    else regen -= kwh;
  }
  return { drawn, regen };
}

// "About 3.1 kWh drawn, 0.4 kWh won back while slowing (13%)."
export function powerVerdict(power: Point[], legs?: { start: number; end: number }[]): string | null {
  if (power.length < 2) return null;
  const { drawn, regen } = traceEnergy(power, legs);
  if (drawn < 0.05) return `Peak ${formatNumber(Math.max(...power.map((p) => p.v)), 1)} kW.`;
  if (regen < 0.05) return `About ${formatKwh(drawn)} drawn, nothing won back while slowing.`;
  return `About ${formatKwh(drawn)} drawn, ${formatKwh(regen)} won back while slowing (${formatPercent((regen / drawn) * 100)}).`;
}

// "Gentle: no hard starts or stops." or "1 hard start at 9:50 PM and 2 hard brakes, at 9:59 PM and 10:03 PM."
export function accelVerdict(moments: HardMoment[]): string {
  if (moments.length === 0) return "Gentle: no hard starts or stops.";
  const part = (kind: HardMoment["kind"], word: string) => {
    const times = moments.filter((m) => m.kind === kind).map((m) => formatClock(m.t));
    if (times.length === 0) return null;
    return `${count(times.length, word)}${times.length === 1 ? " at " : ", at "}${listWords(times)}`;
  };
  return `${[part("brake", "hard brake"), part("start", "hard start")].filter(Boolean).join(" and ")}.`;
}

// Flat: every grade reading within ±FLAT_GRADE.
export function isFlat(grade: Point[]): boolean {
  return grade.every((p) => Math.abs(p.v) <= FLAT_GRADE);
}

type Slope = { t: number; v: number };
type Run = { t: number; v: number; from: number; last: number; up: boolean; steep: number; readings: number };

// The climbs and descents in a grade trace (see CLIMB_GRADE), each kept at its steepest.
export function slopes(grade: Point[]): { climbs: Slope[]; descents: Slope[] } {
  const runs: Run[] = [];
  // Readings under the grade since the open run's last steep one: a dip, if it stays short. A steep
  // reading the other way opens a new run instead, so a stretch never bridges the opposite grade.
  let between = 0;
  for (const p of grade) {
    if (Math.abs(p.v) < CLIMB_GRADE) {
      between += 1;
      continue;
    }
    const up = p.v > 0;
    const open = runs.at(-1);
    if (open && open.up === up && p.t - open.last <= MERGE_DIP_MS) {
      open.last = p.t;
      open.steep += 1;
      open.readings += between + 1;
      if (Math.abs(p.v) > Math.abs(open.v)) Object.assign(open, { t: p.t, v: p.v });
    } else runs.push({ t: p.t, v: p.v, from: p.t, last: p.t, up, steep: 1, readings: 1 });
    between = 0;
  }
  const kept = runs.filter((r) => r.last - r.from >= MIN_SLOPE_MS && r.steep / r.readings >= STEEP_SHARE);
  return { climbs: kept.filter((r) => r.up), descents: kept.filter((r) => !r.up) };
}

// "Flat all the way.", "Mostly flat.", "One climb at 10:03 PM, up to 5%." or "2 climbs, the steepest 5% at
// 10:03 PM, and one descent at 10:10 PM, down to 4%."
export function gradeVerdict(grade: Point[]): string | null {
  if (grade.length === 0) return null;
  if (isFlat(grade)) return "Flat all the way.";
  const { climbs, descents } = slopes(grade);
  if (climbs.length === 0 && descents.length === 0) return "Mostly flat.";
  const steepest = (list: Slope[]) => list.reduce((a, s) => (Math.abs(s.v) > Math.abs(a.v) ? s : a));
  const part = (list: Slope[], word: string, way: string) => {
    if (list.length === 0) return null;
    const top = steepest(list);
    const grade = formatPercent(Math.abs(top.v));
    return list.length === 1 ? `one ${word} at ${formatClock(top.t)}, ${way} ${grade}` : `${list.length} ${word}s, the steepest ${grade} at ${formatClock(top.t)}`;
  };
  const words = [part(climbs, "climb", "up to"), part(descents, "descent", "down to")].filter(Boolean).join(", and ");
  return `${words[0].toUpperCase()}${words.slice(1)}.`;
}

// "Used 1% over 3.7 km.", "Stayed at 70% over 0.8 km.", or with a charge on the way, "70% to 75% over 3.7 km, charged on the way."
export function batteryVerdict(startLevel: number | null, endLevel: number | null, km: number): string | null {
  if (startLevel === null || endLevel === null) return null;
  const used = startLevel - endLevel;
  if (used > 0) return `Used ${formatPercent(used)} over ${formatKm(km)}.`;
  if (used === 0) return `Stayed at ${formatPercent(startLevel)} over ${formatKm(km)}.`;
  return `${formatLevels(startLevel, endLevel)} over ${formatKm(km)}, charged on the way.`;
}
