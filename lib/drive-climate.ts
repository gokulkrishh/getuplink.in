// The climate during a drive: whether the AC was on, the set temperature, and the temperature inside and
// outside. The car sends each of these only when it changes, so a reading holds until the next one, and the
// value at the drive's start is the last reading before it. Pure, so tested (test/drive-climate.test.ts); the
// page draws it (components/stats/climate-trace.tsx) and the drive's tips read its summary (lib/drive-tips.ts).
import { formatCelsius, formatDuration, formatTempRange } from "@/lib/format";
import { num, type Reading } from "@/lib/telemetry-derive";

export type Point = { t: number; v: number };
export type Span = { start: number; end: number };

// A run of a held series inside one window: a point where it takes a value, ending with a marker at the
// window's end that repeats the last value. Between two points the earlier one holds.
export type Run = Point[];

export type Climate = {
  // The stretches the car was under way (a drive's own, a trip's legs): the only time shown.
  windows: Span[];
  // The AC on and off stretches within the windows, by what the car sent. Both null when it sent neither the
  // climate's power nor the AC's switch, so the set temperature can't be tied to the AC being on.
  on: Span[] | null;
  off: Span[] | null;
  // Set temperature while the AC was on (every window, when on or off isn't known), inside and outside.
  set: Run[];
  inside: Run[];
  outside: Run[];
};

// What the car sent in the drive's window, a little either side so the values in force at the start are there.
export type ClimateReadings = {
  power: Reading[]; // HvacPower: "HvacPowerStateOn" / "HvacPowerStateOff"
  ac: Reading[]; // HvacACEnabled: true / false
  left: Reading[]; // HvacLeftTemperatureRequest, °C
  right: Reading[]; // HvacRightTemperatureRequest, °C
  inside: Reading[]; // InsideTemp, °C
  outside: Reading[]; // OutsideTemp, °C
};

const byTime = (a: Point, b: Point) => a.t - b.t;

function numbers(readings: Reading[]): Point[] {
  return readings.flatMap((r) => {
    const v = num(r.value);
    return v === null ? [] : [{ t: Date.parse(r.at), v }];
  }).sort(byTime);
}

// "HvacPowerStateOn" and true are on; "HvacPowerStateOff" and false are off; anything else isn't known.
export function isOn(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const word = value.toLowerCase();
  if (word === "true" || word.endsWith("on")) return true;
  if (word === "false" || word.endsWith("off")) return false;
  return null;
}

function flags(readings: Reading[]): { t: number; on: boolean }[] {
  return readings
    .flatMap((r) => {
      const on = isOn(r.value);
      return on === null ? [] : [{ t: Date.parse(r.at), on }];
    })
    .sort((a, b) => a.t - b.t);
}

const SAME_MOMENT_MS = 2000;

// When the AC was on, as 1 (on) and 0 (off) from the time each change was seen. On is the climate's power
// being on and the AC's switch not being off; with only one of the two sent, that one decides.
export function onSeries(power: Reading[], ac: Reading[]): Point[] {
  const events = [...flags(power).map((e) => ({ ...e, of: "power" as const })), ...flags(ac).map((e) => ({ ...e, of: "ac" as const }))].sort((a, b) => a.t - b.t);
  let powerOn: boolean | null = null;
  let acOn: boolean | null = null;
  const out: Point[] = [];
  let first: number | null = null;
  events.forEach((e, k) => {
    if (e.of === "power") powerOn = e.on;
    else acOn = e.on;
    // The power and the switch change within a second of each other; wait for both so there's no blip between.
    first ??= e.t;
    if (events[k + 1] && events[k + 1].t - e.t <= SAME_MOMENT_MS) return;
    const t = first;
    first = null;
    const on = powerOn === null ? acOn : powerOn && acOn !== false;
    if (on === null) return;
    const v = on ? 1 : 0;
    if (out.at(-1)?.v !== v) out.push({ t, v });
  });
  return out;
}

// A held series cut to windows: in each, the value in force at its start, then each change inside it, then a
// marker at its end. A window the series has no value for yet starts at its first reading, and one with none is
// left out, so nothing is drawn that wasn't seen.
export function stepRuns(changes: Point[], windows: Span[]): Run[] {
  const runs: Run[] = [];
  for (const w of windows) {
    if (w.end <= w.start) continue;
    const before = changes.findLast((p) => p.t <= w.start);
    const run = [...(before ? [{ t: w.start, v: before.v }] : []), ...changes.filter((p) => p.t > w.start && p.t < w.end)];
    if (run.length > 0) runs.push([...run, { t: w.end, v: run[run.length - 1].v }]);
  }
  return runs;
}

// The stretches of the windows where a 1/0 series was `want`, known only from its first reading.
function spansWhere(state: Point[], windows: Span[], want: 0 | 1): Span[] {
  return stepRuns(state, windows).flatMap((run) =>
    run.slice(0, -1).flatMap((p, k) => (p.v === want && run[k + 1].t > p.t ? [{ start: p.t, end: run[k + 1].t }] : [])),
  );
}

// The value in force at t, from runs made by stepRuns; null in a gap or before the first reading.
export function valueAt(runs: Run[], t: number): number | null {
  const run = runs.find((r) => t >= r[0].t && t <= r[r.length - 1].t);
  return run?.findLast((p) => p.t <= t)?.v ?? null;
}

export const inSpans = (spans: Span[] | null, t: number) => spans?.some((s) => t >= s.start && t < s.end) ?? false;

// The driver's set temperature: the left zone's, else the right's. The car sets both together unless the
// owner splits them, which a single line can't show.
export function climateOf(readings: ClimateReadings, windows: Span[]): Climate {
  const state = onSeries(readings.power, readings.ac);
  const known = state.length > 0;
  const on = known ? spansWhere(state, windows, 1) : null;
  const off = known ? spansWhere(state, windows, 0) : null;
  const left = numbers(readings.left);
  const setChanges = left.length > 0 ? left : numbers(readings.right);
  return {
    windows,
    on,
    off,
    set: stepRuns(setChanges, on ?? windows),
    inside: stepRuns(numbers(readings.inside), windows),
    outside: stepRuns(numbers(readings.outside), windows),
  };
}

// The chart shows when the car sent a set temperature or the inside temperature; the outside alone is already
// a tile on the page.
export const hasClimate = (c: Climate) => c.set.length > 0 || c.inside.length > 0;

export type ClimateSummary = {
  totalMs: number; // time under way
  onMs: number | null; // time with the AC on; null when the car didn't say
  set: { low: number; high: number } | null; // the set temperature while on
  insideStart: number | null;
  insideEnd: number | null;
  outside: { low: number; high: number } | null;
};

const reach = (runs: Run[]) => {
  const vs = runs.flatMap((r) => r.map((p) => p.v));
  return vs.length ? { low: Math.min(...vs), high: Math.max(...vs) } : null;
};
const length = (spans: Span[]) => spans.reduce((sum, s) => sum + (s.end - s.start), 0);

export function summariseClimate(c: Climate): ClimateSummary {
  return {
    totalMs: length(c.windows),
    onMs: c.on ? length(c.on) : null,
    set: reach(c.set),
    insideStart: c.inside[0]?.[0].v ?? null,
    insideEnd: c.inside.at(-1)?.at(-1)?.v ?? null,
    outside: reach(c.outside),
  };
}

// "22 °C", or "21 to 24 °C" for a span; one temperature when both ends read the same.
export function formatTempSpan(low: number, high: number): string {
  return formatCelsius(low) === formatCelsius(high) ? formatCelsius(low) : formatTempRange(low, high);
}

// "Inside 22 °C to 25 °C": from where it started to where it ended, one temperature when they read the same.
function fromTo(start: number, end: number): string {
  return formatCelsius(start) === formatCelsius(end) ? formatCelsius(start) : `${formatCelsius(start)} to ${formatCelsius(end)}`;
}

// How long the AC was on, for the description and the tip: "the whole drive" or "52 min of 1 h 5 min".
export function onWords(s: ClimateSummary): string | null {
  if (s.onMs === null || s.onMs <= 0) return null;
  return s.onMs >= s.totalMs - 1000 ? "the whole drive" : `${formatDuration(s.onMs / 1000)} of ${formatDuration(s.totalMs / 1000)}`;
}

// The chart's line, in two short sentences from the readings: "AC on for 56 min, set to 21 to 24 °C. Outside
// 24.5 to 26.5 °C." The inside temperature is left to the chart, where its fall reads at a glance. Parts the
// car didn't send are left out.
export function climateLine(s: ClimateSummary): string {
  const sentences: string[] = [];
  if (s.onMs !== null) {
    const set = s.set ? `, set to ${formatTempSpan(s.set.low, s.set.high)}` : "";
    const how = onWords(s);
    sentences.push(how === null ? "AC off" : how === "the whole drive" ? `AC on the whole drive${set}` : `AC on for ${formatDuration(s.onMs / 1000)}${set}`);
  }
  if (s.outside) sentences.push(`Outside ${formatTempSpan(s.outside.low, s.outside.high)}`);
  return sentences.map((t) => `${t}.`).join(" ");
}

// The °C axis: round ticks a whole step apart that cover every value, at most 5 of them.
export function tempAxis(values: number[]): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = [1, 2, 5, 10, 20].find((s) => Math.ceil(max / s) - Math.floor(min / s) <= 4) ?? 50;
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);
  return { lo, hi, ticks: Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => hi - k * step) };
}

// "off", or the set temperature (°C) a drive mostly ran at, averaged over the time the AC was on. Null when
// the car didn't say whether the AC was on, said it for under half the drive, or sent no set temperature
// while it was on: such a drive is left out, never counted as off.
export type AcSetting = number | "off";

export function acSettingOf(readings: ClimateReadings, drive: Span): AcSetting | null {
  const c = climateOf(readings, [drive]);
  if (!c.on || !c.off) return null;
  const onMs = length(c.on);
  const offMs = length(c.off);
  if ((onMs + offMs) * 2 < drive.end - drive.start) return null;
  if (onMs < offMs) return "off";
  let weighted = 0;
  let time = 0;
  for (const run of c.set)
    run.slice(0, -1).forEach((p, k) => {
      const dt = run[k + 1].t - p.t;
      weighted += p.v * dt;
      time += dt;
    });
  return time > 0 ? weighted / time : null;
}
