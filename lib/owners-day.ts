// One car's IST day for the Owners totals (DayFigures in lib/owners.ts), from the readings lib/server/owners.ts
// loads. Pure, so the hold-last-value rules, one-pedal driving and regen are tested on small fixtures
// (test/owners-day.test.ts). It reuses the app's own pieces: drives and parked stretches (lib/drives.ts),
// hard moments (lib/drive-verdict.ts), the AC's on and off (lib/drive-climate.ts), the parked modes
// (lib/parked-modes.ts) and the speed bands (lib/driving-insights.ts).
//
// The car sends a value only when it changes, so each reading holds until the next. The caller passes the
// readings from before the day too, so the value in force when the day starts is known.
import { istWeekday } from "@/lib/charge-habits";
import { climateOf, type ClimateReadings, isOn, type Span, stepRuns } from "@/lib/drive-climate";
import { hardMoments } from "@/lib/drive-verdict";
import { awakeBetween, type Drive, type ParkedPeriod } from "@/lib/drives";
import { speedHistogram, type TimedValue } from "@/lib/driving-insights";
import { type DayFigures, FIGURES_VERSION, type Install, type Latest } from "@/lib/owners";
import { type ModeReadings, onMsIn } from "@/lib/parked-modes";
import { istDay, istDayStart, num, type Reading } from "@/lib/telemetry-derive";
import { firstOffered, versionChanges } from "@/lib/versions";

const HOUR = 3_600_000;
const DAY = 86_400_000;
// Slowing is deceleration past this, in m/s²: lifting off firmly, braking, or regen doing the work.
export const SLOWING_MS2 = 0.5;

export type Point = { t: number; v: number };
export type Session = { started_at: string; start_level: number | null; energy_added_kwh: number | null; kind: "ac" | "dc" };
// LifetimeEnergyGainedRegen and LifetimeEnergyUsedDrive, kWh counters, as last read before an instant.
export type Counters = { gained: number | null; used: number | null };

// Everything one day is worked out from. A part that is null wasn't sent by the car, or is no longer kept for
// this day (see keptOn in lib/server/owners.ts), and stays null in the figures.
export type DayInputs = {
  day: number;
  drives: Drive[]; // every drive the readings hold; the day takes those that started in it
  parked: ParkedPeriod[]; // parked stretches of 6 hours or more (parkedDrain); the day takes those ending in it
  times: number[]; // when the car sent anything, sorted: it only sends while awake
  sessions: Session[];
  accel: Point[] | null; // LongitudinalAcceleration, m/s², at least the slowing and hard readings
  brake: Reading[] | null; // BrakePedal
  speed: TimedValue[] | null; // km/h
  climate: ClimateReadings;
  seat: Reading[] | null; // ClimateSeatCoolingFrontLeft
  modes: ModeReadings | null;
  counters: { start: Counters; end: Counters };
  installs: Install[];
  latest: Latest | null;
};

// The IST hour of an instant, 0 to 23.
export const istHour = (t: number) => Math.floor((t - istDayStart(istDay(t))) / HOUR);

const inside = (t: number, spans: Span[]) => spans.some((s) => t >= s.start && t <= s.end);
const length = (spans: Span[]) => spans.reduce((a, s) => a + (s.end - s.start), 0);
const rounded = (v: number) => Math.round(v * 1000) / 1000;

// A switch or pedal as on or off from each reading on: true / false, "true" / "false", "...On" / "...Off",
// or a number above 0. Readings that say neither are skipped.
function switches(readings: Reading[]): { t: number; on: boolean }[] {
  return readings
    .flatMap((r) => {
      const on = typeof r.value === "number" ? r.value > 0 : isOn(r.value);
      return on === null ? [] : [{ t: Date.parse(r.at), on }];
    })
    .sort((a, b) => a.t - b.t);
}

// The state in force at t: the last reading at or before it. Null before the first, when it isn't known.
export function heldAt(changes: { t: number; on: boolean }[], t: number): boolean | null {
  return changes.findLast((c) => c.t <= t)?.on ?? null;
}

// Of the moments the car slowed during a drive (each acceleration reading, one a second, at or past
// SLOWING_MS2 of deceleration), how many had the brake pedal up. The pedal holds from each reading to the
// next; a moment before the first pedal reading is left out either way, since its state isn't known.
export function onePedal(accel: Point[], brake: Reading[], drives: Span[]): { slowing: number; noBrake: number } {
  const pedal = switches(brake);
  let slowing = 0;
  let noBrake = 0;
  for (const p of accel) {
    if (p.v > -SLOWING_MS2 || !inside(p.t, drives)) continue;
    const pressed = heldAt(pedal, p.t);
    if (pressed === null) continue;
    slowing++;
    if (!pressed) noBrake++;
  }
  return { slowing, noBrake };
}

// The regen and drive counters' rise over the day. Null without both ends of both, or when one went down
// (a counter that reset).
export function regenDelta(start: Counters, end: Counters): { gained: number; used: number } | null {
  if (start.gained === null || end.gained === null || start.used === null || end.used === null) return null;
  const gained = end.gained - start.gained;
  const used = end.used - start.used;
  return gained >= 0 && used >= 0 ? { gained, used } : null;
}

// Time under way with the AC on, out of the time its state was known, and the set temperature (whole °C)
// while it was on. The set temperature is sent with the AC off too, so only the on time counts. Null when
// the car didn't say when the AC was on.
export function climateDay(readings: ClimateReadings, windows: Span[]): DayFigures["climate"] {
  if (windows.length === 0) return null;
  const c = climateOf(readings, windows);
  if (!c.on || !c.off) return null;
  const setMs: Record<string, number> = {};
  for (const run of c.set)
    run.slice(0, -1).forEach((p, k) => {
      const key = String(Math.round(p.v));
      setMs[key] = (setMs[key] ?? 0) + (run[k + 1].t - p.t);
    });
  return { acMs: length(c.on), knownMs: length(c.on) + length(c.off), setMs };
}

// Whether a front seat's cooling was on at any point of a drive. Null when no level was in force during any.
export function seatCoolingUsed(seat: Reading[], windows: Span[]): boolean | null {
  const levels = seat
    .flatMap((r) => {
      const v = typeof r.value === "boolean" ? Number(r.value) : num(r.value);
      return v === null ? [] : [{ t: Date.parse(r.at), v }];
    })
    .sort((a, b) => a.t - b.t);
  const runs = stepRuns(levels, windows);
  return runs.length ? runs.some((run) => run.some((p) => p.v > 0)) : null;
}

// One Climate Keeper mode as on or off: "ClimateKeeperModeStateDog" is Dog Mode, "...Party" is Camp Mode.
const onlyWhen = (readings: Reading[] | undefined, state: string): Reading[] => (readings ?? []).map((r) => ({ at: r.at, value: r.value === state ? "On" : "Off" }));

// The day's stops: its time outside drives, each held to the time the car was seen awake, since a mode only
// runs while the car is (see lib/parked-modes.ts).
export function parkedModes(day: number, drives: Span[], times: number[], modes: ModeReadings): NonNullable<DayFigures["parkedModes"]> {
  const from = istDayStart(day);
  const to = from + DAY;
  const stops: Span[] = [];
  let cursor = from;
  for (const d of [...drives].sort((a, b) => a.start - b.start)) {
    if (d.end <= cursor || d.start >= to) continue;
    if (d.start > cursor) stops.push({ start: cursor, end: d.start });
    cursor = Math.max(cursor, d.end);
  }
  if (cursor < to) stops.push({ start: cursor, end: to });
  const out = { sentryMs: 0, keeperMs: 0, dogMs: 0, campMs: 0 };
  for (const s of stops) {
    const awake = awakeBetween(times, s.start, s.end);
    const held = (readings: Reading[] | undefined) => Math.min(onMsIn(readings, s.start, s.end), awake);
    out.sentryMs += held(modes.SentryMode);
    out.keeperMs += held(onlyWhen(modes.ClimateKeeperMode, "ClimateKeeperModeStateOn"));
    out.dogMs += held(onlyWhen(modes.ClimateKeeperMode, "ClimateKeeperModeStateDog"));
    out.campMs += held(onlyWhen(modes.ClimateKeeperMode, "ClimateKeeperModeStateParty"));
  }
  return out;
}

// The day's installs from the streamed version: each change to a new version, with how long after it first
// showed up as the pending update (`pending`, SoftwareUpdateVersion) it was installed. `before` is the
// version in force when the readings start; without it the first version seen isn't an install.
export function installsIn(day: number, versions: Reading[], pending: Reading[], before: string | null): Install[] {
  return versionChanges(versions, before)
    .filter((step) => step.previous !== null && istDay(Date.parse(step.at)) === day)
    .map((step) => {
      const offered = firstOffered(pending, step.version, step.at);
      return { waitDays: offered === null ? null : (Date.parse(step.at) - Date.parse(offered)) / DAY, hour: istHour(Date.parse(step.at)) };
    });
}

export function dayFigures(i: DayInputs): DayFigures {
  const drives = i.drives.filter((d) => istDay(d.start) === i.day).sort((a, b) => a.start - b.start);
  const windows = drives.map((d) => ({ start: d.start, end: d.end }));
  const km = drives.reduce((a, d) => a + d.km, 0);
  const hourKm = { weekday: Array<number>(24).fill(0), weekend: Array<number>(24).fill(0) };
  for (const piece of drives.flatMap((d) => d.hourKm ?? [])) {
    hourKm[istWeekday(piece.from) >= 5 ? "weekend" : "weekday"][istHour(piece.from)] += piece.km;
  }
  const withEnergy = drives.filter((d) => d.whPerKm !== null && d.kwh !== null);
  const parked = i.parked.filter((p) => istDay(p.end) === i.day && p.kwh !== null);
  const speed = i.speed ? speedHistogram(i.speed, drives).map((b) => b.share) : [];
  const regen = regenDelta(i.counters.start, i.counters.end);
  return {
    v: FIGURES_VERSION,
    km: rounded(km),
    drives: drives.map((d) => rounded(d.km)),
    energyKm: rounded(withEnergy.reduce((a, d) => a + d.km, 0)),
    energyKwh: rounded(withEnergy.reduce((a, d) => a + d.kwh!, 0)),
    hourKm: { weekday: hourKm.weekday.map(rounded), weekend: hourKm.weekend.map(rounded) },
    parkedHours: rounded(parked.reduce((a, p) => a + p.hours, 0)),
    parkedKwh: rounded(parked.reduce((a, p) => a + p.kwh!, 0)),
    charges: i.sessions
      .filter((s) => istDay(Date.parse(s.started_at)) === i.day)
      .map((s) => ({ hour: istHour(Date.parse(s.started_at)), level: s.start_level, kwh: s.energy_added_kwh, dc: s.kind === "dc" })),
    hard: i.accel ? { count: hardMoments(i.accel.filter((p) => inside(p.t, windows))).length, km: rounded(km) } : null,
    onePedal: i.accel && i.brake ? { ...onePedal(i.accel, i.brake, windows), km: rounded(km) } : null,
    regen: regen ? { gained: rounded(regen.gained), used: rounded(regen.used), km: rounded(km) } : null,
    speed: speed.length ? { shares: speed.map(rounded), ms: length(windows) } : null,
    climate: climateDay(i.climate, windows),
    seatCooling: i.seat ? seatCoolingUsed(i.seat, windows) : null,
    parkedModes: i.modes ? parkedModes(i.day, windows, i.times, i.modes) : null,
    installs: i.installs,
    latest: i.latest,
  };
}
