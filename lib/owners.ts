// The Owners page (/owners): how owners who share use their cars, as totals across at least MIN_CARS cars,
// and where the owner's own car sits. Pure (no database), so it's tested directly (test/owners.test.ts);
// lib/owners-day.ts works out a day's figures from the readings, lib/server/owners.ts loads and stores them.
//
// Three shapes, from the car to the page:
//   DayFigures: one car's IST day (fleet_car_days.figures). Sums only (km, kWh, minutes), so days add up.
//   CarSummary: one car's last WINDOW_DAYS days, one value per metric, or null when the car has too little
//     data for it (each metric's `need`).
//   OwnerStats: what is published (fleet_stats.stats): binned counts, shares and rounded ranges, each across
//     at least MIN_CARS cars, never one car's value.
import { PSI_PER_BAR } from "@/lib/car";
import { SPEED_BINS } from "@/lib/driving-insights";
import { formatHours, formatNumber, formatPercent } from "@/lib/format";
import { median } from "@/lib/telemetry-derive";

// A figure, and each group of one, shows only across at least this many cars.
export const MIN_CARS = 5;
// A model, colour or wheel fewer cars than this have joins "Other", so a rare car can't be picked out.
export const OTHER_MIN = 3;
export const WINDOW_DAYS = 30;
// Day rows are kept a little past the window, then deleted.
export const KEEP_DAYS = 35;
// Bumped when a day's figures change shape or method: older rows are worked out again.
export const FIGURES_VERSION = 1;
export const STATS_VERSION = 1;
// A histogram wider than this folds its far ends into "or less" and "or more" bins.
export const MAX_BINS = 24;

const HOUR = 3_600_000;

// ---- One car's day ----

export type Charge = { hour: number; level: number | null; kwh: number | null; dc: boolean };
// waitDays: from the update first showing up on the car to it being installed; null when the offer wasn't seen.
export type Install = { waitDays: number | null; hour: number };

// The settings read from the car's latest values. Values are stored as the car sent them; the labels below
// say what each means.
export const SETTING_FIELDS = [
  "PinToDriveEnabled",
  "ScheduledChargingMode",
  "EmergencyLaneDepartureAvoidance",
  "AutomaticEmergencyBrakingOff",
  "BlindSpotCollisionWarningChime",
  "AutomaticBlindSpotCamera",
  "SpeedLimitWarning",
  "ForwardCollisionWarning",
  "LaneDepartureAvoidance",
  "CruiseFollowDistance",
  "PairedPhoneKeyAndKeyFobQty",
  "CabinOverheatProtectionMode",
] as const;
export type SettingField = (typeof SETTING_FIELDS)[number];

// The car as it was when its day was worked out: what it is, and its latest settings. Tyres in bar, as the
// car sends them.
export type Latest = {
  model: string | null;
  pack: string | null;
  drive: string | null;
  lfp: boolean;
  paint: string | null;
  wheels: string | null;
  capacityKwh: number | null;
  tyreFrontBar: number | null;
  tyreRearBar: number | null;
  chargeLimit: number | null;
  settings: Partial<Record<SettingField, unknown>>;
};

// One IST day. A part the car didn't send, or that was no longer kept when the day was worked out, is null,
// never 0: brake use, seat cooling and the parked modes are kept only a week (lib/telemetry-retention.ts).
export type DayFigures = {
  v: number;
  km: number;
  drives: number[]; // each drive's km, by the day it started
  energyKm: number; // drives of at least 1 km with their energy known
  energyKwh: number;
  hourKm: { weekday: number[]; weekend: number[] }; // km in each IST hour
  parkedHours: number; // stretches parked with their energy known
  parkedKwh: number;
  charges: Charge[];
  hard: { count: number; km: number } | null;
  onePedal: { slowing: number; noBrake: number; km: number } | null; // readings while slowing
  regen: { gained: number; used: number; km: number } | null; // kWh, the counters' rise over the day
  speed: { shares: number[]; ms: number } | null; // share of driving time in each SPEED_BANDS band
  climate: { acMs: number; knownMs: number; setMs: Record<string, number> } | null; // set °C while on
  seatCooling: boolean | null;
  parkedModes: { sentryMs: number; keeperMs: number; dogMs: number; campMs: number } | null;
  installs: Install[];
  latest: Latest | null;
};

export type CarDay = { day: number; figures: DayFigures };

// ---- What a setting's value means ----

// What the car sends, in plain words (Tesla's fleet-telemetry vehicle_data.proto names). A value not listed
// here (a new one, or "...Unknown") is left out of the totals, never guessed.
export const SETTING_LABELS: Record<string, string> = {
  SpeedAssistLevelNone: "Off",
  SpeedAssistLevelDisplay: "Display",
  SpeedAssistLevelChime: "Chime",
  ForwardCollisionSensitivityOff: "Off",
  ForwardCollisionSensitivityLate: "Late",
  ForwardCollisionSensitivityAverage: "Average",
  ForwardCollisionSensitivityEarly: "Early",
  LaneAssistLevelNone: "Off",
  LaneAssistLevelWarning: "Warning",
  LaneAssistLevelAssist: "Assist",
  ScheduledChargingModeOff: "Off",
  ScheduledChargingModeStartAt: "Start at a set time",
  ScheduledChargingModeDepartBy: "Ready by a set time",
  CabinOverheatProtectionModeStateOff: "Off",
  CabinOverheatProtectionModeStateOn: "On",
  CabinOverheatProtectionModeStateFanOnly: "Fan only",
  FollowDistance1: "1",
  FollowDistance2: "2",
  FollowDistance3: "3",
  FollowDistance4: "4",
  FollowDistance5: "5",
  FollowDistance6: "6",
  FollowDistance7: "7",
};

// A switch the car sends as true or false (AEB as "off": true means braking is off).
function flag(value: unknown, invert = false): "on" | "off" | null {
  if (typeof value !== "boolean") return null;
  return value !== invert ? "on" : "off";
}

// An enum setting, kept only when its value is one this page knows.
const known = (value: unknown, prefix: string): string | null => (typeof value === "string" && value.startsWith(prefix) && value in SETTING_LABELS ? value : null);

function scheduled(value: unknown): "on" | "off" | null {
  if (value === "ScheduledChargingModeOff") return "off";
  return value === "ScheduledChargingModeStartAt" || value === "ScheduledChargingModeDepartBy" ? "on" : null;
}

function keyCount(value: unknown): string | null {
  const n = typeof value === "number" ? value : null;
  if (n === null || !Number.isInteger(n) || n < 1) return null;
  return n >= 5 ? "5+" : String(n);
}

// ---- The 30-day totals a summary is worked out from ----

export type Totals = {
  days: number;
  km: number;
  drives: number[];
  energyKm: number;
  energyKwh: number;
  hourWeekday: number[];
  hourWeekend: number[];
  parkedHours: number;
  parkedKwh: number;
  charges: Charge[];
  hardCount: number;
  hardKm: number;
  slowing: number;
  noBrake: number;
  onePedalDays: number;
  onePedalKm: number;
  regenGained: number;
  regenUsed: number;
  regenKm: number;
  speedMs: number[];
  speedTotalMs: number;
  acMs: number;
  climateMs: number;
  setMs: Record<string, number>;
  seatDays: number;
  seatUsed: boolean;
  modeDays: number;
  sentryMs: number;
  keeperMs: number;
  dogMs: number;
  campMs: number;
  installs: Install[];
  latest: Latest | null;
};

const zeros = (n: number) => Array<number>(n).fill(0);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const addInto = (into: number[], from: number[] | undefined) => from?.forEach((v, k) => (into[k] = (into[k] ?? 0) + v));

export function totalsOf(days: CarDay[], latest: Latest | null = null): Totals {
  const t: Totals = {
    days: days.length,
    km: 0,
    drives: [],
    energyKm: 0,
    energyKwh: 0,
    hourWeekday: zeros(24),
    hourWeekend: zeros(24),
    parkedHours: 0,
    parkedKwh: 0,
    charges: [],
    hardCount: 0,
    hardKm: 0,
    slowing: 0,
    noBrake: 0,
    onePedalDays: 0,
    onePedalKm: 0,
    regenGained: 0,
    regenUsed: 0,
    regenKm: 0,
    speedMs: zeros(SPEED_BANDS.length),
    speedTotalMs: 0,
    acMs: 0,
    climateMs: 0,
    setMs: {},
    seatDays: 0,
    seatUsed: false,
    modeDays: 0,
    sentryMs: 0,
    keeperMs: 0,
    dogMs: 0,
    campMs: 0,
    installs: [],
    latest,
  };
  // Newest first, so the latest settings are the newest day's.
  for (const { figures: f } of [...days].sort((a, b) => b.day - a.day)) {
    t.km += f.km;
    t.drives.push(...f.drives);
    t.energyKm += f.energyKm;
    t.energyKwh += f.energyKwh;
    addInto(t.hourWeekday, f.hourKm.weekday);
    addInto(t.hourWeekend, f.hourKm.weekend);
    t.parkedHours += f.parkedHours;
    t.parkedKwh += f.parkedKwh;
    t.charges.push(...f.charges);
    if (f.hard) {
      t.hardCount += f.hard.count;
      t.hardKm += f.hard.km;
    }
    if (f.onePedal) {
      t.slowing += f.onePedal.slowing;
      t.noBrake += f.onePedal.noBrake;
      t.onePedalKm += f.onePedal.km;
      t.onePedalDays++;
    }
    if (f.regen) {
      t.regenGained += f.regen.gained;
      t.regenUsed += f.regen.used;
      t.regenKm += f.regen.km;
    }
    if (f.speed) {
      f.speed.shares.forEach((share, k) => (t.speedMs[k] += share * f.speed!.ms));
      t.speedTotalMs += f.speed.ms;
    }
    if (f.climate) {
      t.acMs += f.climate.acMs;
      t.climateMs += f.climate.knownMs;
      for (const [c, ms] of Object.entries(f.climate.setMs)) t.setMs[c] = (t.setMs[c] ?? 0) + ms;
    }
    if (f.seatCooling !== null) {
      t.seatDays++;
      t.seatUsed ||= f.seatCooling;
    }
    if (f.parkedModes) {
      t.modeDays++;
      t.sentryMs += f.parkedModes.sentryMs;
      t.keeperMs += f.parkedModes.keeperMs;
      t.dogMs += f.parkedModes.dogMs;
      t.campMs += f.parkedModes.campMs;
    }
    t.installs.push(...f.installs);
    t.latest ??= f.latest;
  }
  return t;
}

// What a metric can ask a car to have before the car counts: so many days of rows, km, drives and so on.
export type NeedKey =
  | "days"
  | "km"
  | "drives"
  | "charges"
  | "levels"
  | "chargeKwh"
  | "energyKm"
  | "parkedHours"
  | "hardKm"
  | "onePedalDays"
  | "onePedalKm"
  | "regenKm"
  | "speedHours"
  | "acHours"
  | "setHours"
  | "seatDays"
  | "modeDays"
  | "installs";
export type Need = Partial<Record<NeedKey, number>>;

export function have(t: Totals): Record<NeedKey, number> {
  return {
    days: t.days,
    km: t.km,
    drives: t.drives.length,
    charges: t.charges.length,
    levels: t.charges.filter((c) => c.level !== null).length,
    chargeKwh: t.charges.filter((c) => c.kwh !== null && c.kwh > 0).length,
    energyKm: t.energyKm,
    parkedHours: t.parkedHours,
    hardKm: t.hardKm,
    onePedalDays: t.onePedalDays,
    onePedalKm: t.onePedalKm,
    regenKm: t.regenKm,
    speedHours: t.speedTotalMs / HOUR,
    acHours: t.climateMs / HOUR,
    setHours: sum(Object.values(t.setMs)) / HOUR,
    seatDays: t.seatDays,
    modeDays: t.modeDays,
    installs: t.installs.length,
  };
}

export function meets(need: Need, counts: Record<NeedKey, number>): boolean {
  return Object.entries(need).every(([key, min]) => counts[key as NeedKey] >= min);
}

// ---- The metrics ----

export type Section = "yours" | "charging" | "driving" | "comfort" | "parked" | "settings" | "software" | "identity";
// Who a car is compared with: every car, cars of its model, battery and drive, or of its battery kind.
export type Segment = "all" | "model" | "battery";
export type Option = { key: string; label: string; says?: string };
export type HoursValue = { shares: number[]; rush?: number; weekend?: number };
export type Value = number | string | number[] | HoursValue;

type Common = { key: MetricKey; segment: Segment; need: Need };

// A figure per car, shown as a histogram: `step` is the bins' width and the precision of the range.
export type SpreadMetric = Common & {
  kind: "spread";
  step: number;
  unit: string; // after the range: "Wh/km", "%"
  axis?: string; // the axis title when the unit is long: "a week" for "times a week"
  digits: number; // the owner's own figure
  value: (t: Totals) => number | null;
  half: (range: string) => string;
  you: (value: string, place: string) => string;
};

// One option per car, shown as a bar per option. `options` "open" takes the values as they come (paint),
// with `other` folding rare ones into Other. `mix`: each car has a share in every option (speeds), and the
// bar is the cars' average.
export type ChoiceMetric = Common & {
  kind: "choice";
  options: Option[] | "open";
  other?: boolean;
  mix?: boolean;
  label?: string; // the row's name in a list
  name?: string; // the same inside a sentence, where it isn't the label lowercased: "forward collision warning"
  yes?: string; // words for the owner's own "on" in a list, like "used"
  value: (t: Totals) => string | number[] | null;
  top?: (option: string, share: string) => string;
  you?: (option: string) => string;
};

// Share of something by IST hour, each car counting equally.
export type HoursMetric = Common & { kind: "hours"; value: (t: Totals) => HoursValue | null };

// A share per car (0 to 1), averaged across cars.
export type ShareMetric = Common & { kind: "share"; value: (t: Totals) => number | null };

export type Metric = SpreadMetric | ChoiceMetric | HoursMetric | ShareMetric;

export type MetricKey =
  | "energy"
  | "parkedLoss"
  | "capacity"
  | "tyreFront"
  | "tyreRear"
  | "chargeLimit"
  | "plugLevel"
  | "chargesWeek"
  | "dcShare"
  | "plugHours"
  | "kmWeek"
  | "driveLength"
  | "driveHours"
  | "rushShare"
  | "hardPer100"
  | "onePedal"
  | "regenShare"
  | "speeds"
  | "cabinSet"
  | "acShare"
  | "seatCooling"
  | "climateKeeper"
  | "dogMode"
  | "campMode"
  | "overheat"
  | "sentryUsed"
  | "sentryHours"
  | "pinToDrive"
  | "scheduledCharging"
  | "laneEmergency"
  | "emergencyBraking"
  | "blindSpotChime"
  | "blindSpotCamera"
  | "speedLimitWarning"
  | "collisionWarning"
  | "laneAvoidance"
  | "followDistance"
  | "keys"
  | "installWait"
  | "installNight"
  | "model"
  | "paint"
  | "wheels";

// Speed bands, km/h, as the Driving page's speed chart has them.
export const SPEED_BANDS = SPEED_BINS;
const speedLabel = (k: number) => {
  const from = SPEED_BANDS[k];
  const to = SPEED_BANDS[k + 1];
  return k === 0 ? `Under ${to} km/h` : to === undefined ? `${from} km/h or more` : `${from} to ${to} km/h`;
};

// Weekday rush hours, IST: 8 AM to 11 AM and 5 PM to 9 PM.
export const RUSH_HOURS = [8, 9, 10, 17, 18, 19, 20];
// 10 PM to 6 AM, IST.
export const NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5];

const ON_OFF: Option[] = [
  { key: "on", label: "On" },
  { key: "off", label: "Off" },
];
const enumOptions = (...keys: string[]): Option[] => keys.map((key) => ({ key, label: SETTING_LABELS[key] }));
const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const shares = (values: number[]) => {
  const total = sum(values);
  return total > 0 ? values.map((v) => v / total) : null;
};
const round5 = (v: number) => Math.round(v / 5) * 5;
const used = (ms: number) => (ms > 0 ? "on" : "off");

// The car's group for "Cars like yours": model, battery and drive, all three known.
export function segmentOf(car: Pick<Latest, "model" | "pack" | "drive"> | null): string | null {
  if (!car?.model || !car.pack || !car.drive) return null;
  return [car.model, car.pack, car.drive].join(" · ");
}

// The table: every metric, its kind, who it's compared with, the least a car needs to count, and its words.
export const METRICS: Metric[] = [
  // Cars like yours
  {
    key: "energy",
    kind: "spread",
    segment: "model",
    need: { energyKm: 100 },
    step: 10,
    unit: "Wh/km",
    digits: 0,
    value: (t) => (t.energyKm > 0 ? (t.energyKwh * 1000) / t.energyKm : null),
    half: (r) => `Half of owners use ${r}.`,
    you: (v, p) => `You use ${v}, ${p}.`,
  },
  {
    key: "parkedLoss",
    kind: "spread",
    segment: "model",
    need: { parkedHours: 72 },
    step: 0.2,
    unit: "kWh a day",
    digits: 1,
    value: (t) => (t.parkedHours > 0 ? (t.parkedKwh / t.parkedHours) * 24 : null),
    half: (r) => `Half of owners' cars lose ${r} while parked.`,
    you: (v, p) => `Yours loses ${v}, ${p}.`,
  },
  {
    key: "capacity",
    kind: "spread",
    segment: "model",
    need: {},
    step: 0.5,
    unit: "kWh",
    digits: 1,
    value: (t) => t.latest?.capacityKwh ?? null,
    half: (r) => `Half of owners' batteries hold ${r} when full.`,
    you: (v, p) => `Yours holds ${v}, ${p}.`,
  },
  {
    key: "tyreFront",
    kind: "spread",
    segment: "model",
    need: {},
    step: 1,
    unit: "psi",
    digits: 0,
    value: (t) => (t.latest?.tyreFrontBar ? t.latest.tyreFrontBar * PSI_PER_BAR : null),
    half: (r) => `Half of owners keep ${r} in the front tyres.`,
    you: (v, p) => `You keep ${v}, ${p}.`,
  },
  {
    key: "tyreRear",
    kind: "spread",
    segment: "model",
    need: {},
    step: 1,
    unit: "psi",
    digits: 0,
    value: (t) => (t.latest?.tyreRearBar ? t.latest.tyreRearBar * PSI_PER_BAR : null),
    half: (r) => `Half of owners keep ${r} in the rear tyres.`,
    you: (v, p) => `You keep ${v}, ${p}.`,
  },
  // Charging
  {
    key: "chargeLimit",
    kind: "choice",
    segment: "battery",
    need: {},
    options: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map((n) => ({ key: String(n), label: formatPercent(n) })),
    value: (t) => {
      const limit = t.latest?.chargeLimit;
      return typeof limit === "number" && limit >= 50 && limit <= 100 ? String(round5(limit)) : null;
    },
    top: (o, s) => `${s} of owners charge to ${o}.`,
    you: (o) => `You charge to ${o}.`,
  },
  {
    key: "plugLevel",
    kind: "spread",
    segment: "all",
    need: { levels: 2 },
    step: 10,
    unit: "%",
    digits: 0,
    value: (t) => {
      const levels = t.charges.flatMap((c) => (c.level === null ? [] : [c.level]));
      return levels.length ? median(levels) : null;
    },
    half: (r) => `Half of owners plug in at ${r}.`,
    you: (v, p) => `You plug in at ${v}, ${p}.`,
  },
  {
    key: "chargesWeek",
    kind: "spread",
    segment: "all",
    need: { days: 14 },
    step: 0.5,
    unit: "times a week",
    axis: "a week",
    digits: 1,
    value: (t) => (t.days > 0 ? (t.charges.length / t.days) * 7 : null),
    half: (r) => `Half of owners charge ${r}.`,
    you: (v, p) => `You charge ${v} times, ${p}.`,
  },
  {
    key: "dcShare",
    kind: "choice",
    segment: "all",
    need: { chargeKwh: 2 },
    options: [
      { key: "slow", label: "Almost all slow (AC)", says: "almost all slow (AC)" },
      { key: "mostlySlow", label: "Mostly slow", says: "mostly slow" },
      { key: "mostlyFast", label: "Mostly fast", says: "mostly fast" },
      { key: "fast", label: "Almost all fast (DC)", says: "almost all fast (DC)" },
    ],
    value: (t) => {
      const all = t.charges.filter((c) => c.kwh !== null && c.kwh > 0);
      const dc = share(sum(all.filter((c) => c.dc).map((c) => c.kwh!)), sum(all.map((c) => c.kwh!)));
      if (dc === null) return null;
      return dc < 0.1 ? "slow" : dc < 0.5 ? "mostlySlow" : dc < 0.9 ? "mostlyFast" : "fast";
    },
    top: (o, s) => `${s} of owners charge ${o}.`,
    you: (o) => `You charge ${o}.`,
  },
  {
    key: "plugHours",
    kind: "hours",
    segment: "all",
    need: { charges: 2 },
    value: (t) => {
      const counts = zeros(24);
      for (const c of t.charges) counts[c.hour]++;
      const s = shares(counts);
      return s ? { shares: s } : null;
    },
  },
  // Driving
  {
    key: "kmWeek",
    kind: "spread",
    segment: "all",
    need: { days: 21 },
    step: 25,
    unit: "km a week",
    axis: "km a week",
    digits: 0,
    value: (t) => (t.days > 0 ? (t.km / t.days) * 7 : null),
    half: (r) => `Half of owners drive ${r}.`,
    you: (v, p) => `You drive ${v}, ${p}.`,
  },
  {
    key: "driveLength",
    kind: "spread",
    segment: "all",
    need: { drives: 5 },
    step: 2,
    unit: "km",
    digits: 1,
    value: (t) => (t.drives.length ? median(t.drives) : null),
    half: (r) => `Half of owners' usual drive is ${r}.`,
    you: (v, p) => `Yours is ${v}, ${p}.`,
  },
  {
    key: "driveHours",
    kind: "hours",
    segment: "all",
    need: { km: 50 },
    value: (t) => {
      const total = sum(t.hourWeekday) + sum(t.hourWeekend);
      const s = shares(t.hourWeekday.map((km, h) => km + t.hourWeekend[h]));
      if (!s || total <= 0) return null;
      return { shares: s, rush: sum(RUSH_HOURS.map((h) => t.hourWeekday[h])) / total, weekend: sum(t.hourWeekend) / total };
    },
  },
  // Each car's own rush-hour share, so a car can be placed against the others (the hours card has only the mean).
  {
    key: "rushShare",
    kind: "spread",
    segment: "all",
    need: { km: 50 },
    step: 10,
    unit: "%",
    digits: 0,
    value: (t) => {
      const total = sum(t.hourWeekday) + sum(t.hourWeekend);
      return total > 0 ? (sum(RUSH_HOURS.map((h) => t.hourWeekday[h])) / total) * 100 : null;
    },
    half: (r) => `Half of owners do ${r} of their driving in weekday rush hours.`,
    you: (v, p) => `You do ${v}, ${p}.`,
  },
  {
    key: "hardPer100",
    kind: "spread",
    segment: "all",
    need: { hardKm: 100 },
    step: 1,
    unit: "times every 100 km",
    axis: "per 100 km",
    digits: 1,
    value: (t) => (t.hardKm > 0 ? (t.hardCount / t.hardKm) * 100 : null),
    half: (r) => `Half of owners brake or speed up hard ${r}.`,
    you: (v, p) => `You do it ${v} times, ${p}.`,
  },
  {
    key: "onePedal",
    kind: "spread",
    segment: "all",
    need: { onePedalDays: 5, onePedalKm: 50 },
    step: 10,
    unit: "%",
    digits: 0,
    value: (t) => (t.slowing > 0 ? (t.noBrake / t.slowing) * 100 : null),
    half: (r) => `Half of owners slow down without the brake pedal ${r} of the time.`,
    you: (v, p) => `You do ${v}, ${p}.`,
  },
  {
    key: "regenShare",
    kind: "spread",
    segment: "all",
    need: { regenKm: 50 },
    step: 2,
    unit: "%",
    digits: 0,
    value: (t) => (t.regenUsed > 0 ? (t.regenGained / t.regenUsed) * 100 : null),
    half: (r) => `For half of owners, regen gives back ${r} of the energy used driving.`,
    you: (v, p) => `Yours gives back ${v}, ${p}.`,
  },
  {
    key: "speeds",
    kind: "choice",
    segment: "all",
    need: { speedHours: 1 },
    mix: true,
    options: SPEED_BANDS.map((from, k) => ({ key: String(from), label: speedLabel(k) })),
    value: (t) => shares(t.speedMs),
    top: (o, s) => `Owners spend most time at ${o.toLowerCase()}, ${s} of their driving.`,
  },
  // Comfort and heat
  {
    key: "cabinSet",
    kind: "choice",
    segment: "all",
    need: { setHours: 1 },
    options: Array.from({ length: 14 }, (_, k) => ({ key: String(15 + k), label: `${15 + k} °C` })),
    value: (t) => {
      const total = sum(Object.values(t.setMs));
      if (total <= 0) return null;
      const mean = Object.entries(t.setMs).reduce((a, [c, ms]) => a + Number(c) * ms, 0) / total;
      return String(Math.min(28, Math.max(15, Math.round(mean))));
    },
    top: (o, s) => `${s} of owners set ${o}.`,
    you: (o) => `You set ${o}.`,
  },
  {
    key: "acShare",
    kind: "spread",
    segment: "all",
    need: { acHours: 1 },
    step: 10,
    unit: "%",
    digits: 0,
    value: (t) => (t.climateMs > 0 ? (t.acMs / t.climateMs) * 100 : null),
    half: (r) => `Half of owners have the AC on for ${r} of their driving.`,
    you: (v, p) => `You have it on ${v}, ${p}.`,
  },
  {
    key: "seatCooling",
    kind: "choice",
    segment: "all",
    need: { seatDays: 3 },
    options: ON_OFF,
    label: "Seat cooling",
    yes: "used",
    value: (t) => (t.seatUsed ? "on" : "off"),
  },
  {
    key: "climateKeeper",
    kind: "choice",
    segment: "all",
    need: { modeDays: 5 },
    options: ON_OFF,
    label: "Climate Keeper",
    yes: "used",
    value: (t) => used(t.keeperMs),
  },
  {
    key: "dogMode",
    kind: "choice",
    segment: "all",
    need: { modeDays: 5 },
    options: ON_OFF,
    label: "Dog Mode",
    yes: "used",
    value: (t) => used(t.dogMs),
  },
  {
    key: "campMode",
    kind: "choice",
    segment: "all",
    need: { modeDays: 5 },
    options: ON_OFF,
    label: "Camp Mode",
    yes: "used",
    value: (t) => used(t.campMs),
  },
  {
    key: "overheat",
    kind: "choice",
    segment: "all",
    need: {},
    options: enumOptions("CabinOverheatProtectionModeStateOn", "CabinOverheatProtectionModeStateFanOnly", "CabinOverheatProtectionModeStateOff").map((o) => ({
      ...o,
      says: o.label === "Fan only" ? "on fan only" : o.label.toLowerCase(),
    })),
    label: "Cabin Overheat Protection",
    value: (t) => known(t.latest?.settings.CabinOverheatProtectionMode, "CabinOverheatProtectionModeState"),
    top: (o, s) => `${s} of owners keep it ${o}.`,
    you: (o) => `Yours is ${o}.`,
  },
  // Parked
  {
    key: "sentryUsed",
    kind: "choice",
    segment: "all",
    need: { modeDays: 5 },
    options: ON_OFF,
    label: "Sentry Mode",
    yes: "used",
    value: (t) => used(t.sentryMs),
  },
  {
    key: "sentryHours",
    kind: "spread",
    segment: "all",
    need: { modeDays: 5 },
    step: 1,
    unit: "hours a day",
    digits: 1,
    value: (t) => (t.sentryMs > 0 && t.modeDays > 0 ? t.sentryMs / HOUR / t.modeDays : null),
    half: (r) => `Half of them run it ${r}.`,
    you: (v, p) => `You run it ${v} hours a day, ${p}.`,
  },
  // Settings owners keep
  { key: "pinToDrive", kind: "choice", segment: "all", need: {}, options: ON_OFF, label: "PIN to Drive", value: (t) => flag(t.latest?.settings.PinToDriveEnabled) },
  { key: "scheduledCharging", kind: "choice", segment: "all", need: {}, options: ON_OFF, label: "Scheduled charging", name: "scheduled charging", value: (t) => scheduled(t.latest?.settings.ScheduledChargingMode) },
  {
    key: "laneEmergency",
    kind: "choice",
    segment: "all",
    need: {},
    options: ON_OFF,
    label: "Emergency lane departure avoidance",
    value: (t) => flag(t.latest?.settings.EmergencyLaneDepartureAvoidance),
  },
  {
    key: "emergencyBraking",
    kind: "choice",
    segment: "all",
    need: {},
    options: ON_OFF,
    label: "Automatic emergency braking",
    value: (t) => flag(t.latest?.settings.AutomaticEmergencyBrakingOff, true),
  },
  { key: "blindSpotChime", kind: "choice", segment: "all", need: {}, options: ON_OFF, label: "Blind spot chime", value: (t) => flag(t.latest?.settings.BlindSpotCollisionWarningChime) },
  { key: "blindSpotCamera", kind: "choice", segment: "all", need: {}, options: ON_OFF, label: "Automatic blind spot camera", value: (t) => flag(t.latest?.settings.AutomaticBlindSpotCamera) },
  {
    key: "speedLimitWarning",
    kind: "choice",
    segment: "all",
    need: {},
    options: enumOptions("SpeedAssistLevelNone", "SpeedAssistLevelDisplay", "SpeedAssistLevelChime"),
    label: "Speed limit warning",
    name: "speed limit warning",
    value: (t) => known(t.latest?.settings.SpeedLimitWarning, "SpeedAssistLevel"),
  },
  {
    key: "collisionWarning",
    kind: "choice",
    segment: "all",
    need: {},
    options: enumOptions("ForwardCollisionSensitivityOff", "ForwardCollisionSensitivityLate", "ForwardCollisionSensitivityAverage", "ForwardCollisionSensitivityEarly"),
    label: "Forward collision warning",
    name: "forward collision warning",
    value: (t) => known(t.latest?.settings.ForwardCollisionWarning, "ForwardCollisionSensitivity"),
  },
  {
    key: "laneAvoidance",
    kind: "choice",
    segment: "all",
    need: {},
    options: enumOptions("LaneAssistLevelNone", "LaneAssistLevelWarning", "LaneAssistLevelAssist"),
    label: "Lane departure avoidance",
    value: (t) => known(t.latest?.settings.LaneDepartureAvoidance, "LaneAssistLevel"),
  },
  {
    key: "followDistance",
    kind: "choice",
    segment: "all",
    need: {},
    options: enumOptions(...[1, 2, 3, 4, 5, 6, 7].map((n) => `FollowDistance${n}`)),
    label: "Following distance",
    value: (t) => known(t.latest?.settings.CruiseFollowDistance, "FollowDistance"),
  },
  {
    key: "keys",
    kind: "choice",
    segment: "all",
    need: {},
    options: ["1", "2", "3", "4", "5+"].map((key) => ({ key, label: key === "5+" ? "5 or more" : key })),
    label: "Phone keys and key fobs",
    value: (t) => keyCount(t.latest?.settings.PairedPhoneKeyAndKeyFobQty),
  },
  // Software
  {
    key: "installWait",
    kind: "choice",
    segment: "all",
    need: { installs: 1 },
    options: [
      { key: "0", label: "Same day", says: "on the day it arrives" },
      { key: "1", label: "1 to 2 days", says: "1 to 2 days after it arrives" },
      { key: "3", label: "3 to 7 days", says: "3 to 7 days after it arrives" },
      { key: "8", label: "Longer", says: "more than a week after it arrives" },
    ],
    value: (t) => {
      const waits = t.installs.flatMap((i) => (i.waitDays === null ? [] : [i.waitDays]));
      if (!waits.length) return null;
      const days = Math.floor(median(waits));
      return days < 1 ? "0" : days <= 2 ? "1" : days <= 7 ? "3" : "8";
    },
    top: (o, s) => `${s} of owners install an update ${o}.`,
    you: (o) => `You usually install ${o}.`,
  },
  {
    key: "installNight",
    kind: "share",
    segment: "all",
    need: { installs: 1 },
    value: (t) => share(t.installs.filter((i) => NIGHT_HOURS.includes(i.hour)).length, t.installs.length),
  },
  // What owners drive
  {
    key: "model",
    kind: "choice",
    segment: "all",
    need: {},
    options: "open",
    other: true,
    value: (t) => segmentOf(t.latest) ?? t.latest?.model ?? null,
    top: (o, s) => `The ${o} is the most common, with ${s} of owners.`,
  },
  {
    key: "paint",
    kind: "choice",
    segment: "all",
    need: {},
    options: "open",
    other: true,
    value: (t) => t.latest?.paint ?? null,
    top: (o, s) => `${o} is the most common colour, on ${s} of cars.`,
  },
  {
    key: "wheels",
    kind: "choice",
    segment: "all",
    need: {},
    options: "open",
    other: true,
    value: (t) => t.latest?.wheels ?? null,
    top: (o, s) => `${o} wheels are the most common, on ${s} of cars.`,
  },
];

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));
export const metric = (key: MetricKey): Metric => BY_KEY.get(key)!;

// ---- The page's sections and cards ----

export const SECTIONS: { key: Section; title: string }[] = [
  { key: "yours", title: "Cars like yours" },
  { key: "charging", title: "Charging" },
  { key: "driving", title: "Driving" },
  { key: "comfort", title: "Comfort and heat" },
  { key: "parked", title: "Parked" },
  { key: "settings", title: "Settings owners keep" },
  { key: "software", title: "Software" },
  { key: "identity", title: "What owners drive" },
];

// One card per question. `list`: rows of options or switches (the settings), not a chart. `info` is the ⓘ.
export type Card = { key: string; section: Section; title?: string; metrics: MetricKey[]; list?: boolean; info?: string };

// Cards worked out and given to the MCP connector, but kept off the page to keep it short: each needs
// explaining, or rarely leads anywhere. Put one back by taking it out of here.
export const OFF_PAGE = new Set(["capacity", "tyres", "driveLength", "hardPer100", "onePedal", "regenShare", "speeds", "cooling", "overheat", "wheels"]);

export const CARDS: Card[] = [
  { key: "energy", section: "yours", title: "How much energy do owners use?", metrics: ["energy"] },
  { key: "parkedLoss", section: "yours", title: "How much charge is lost parked?", metrics: ["parkedLoss"] },
  { key: "capacity", section: "yours", title: "How much does a full battery hold?", metrics: ["capacity"] },
  { key: "tyres", section: "yours", title: "What tyre pressure do owners keep?", metrics: ["tyreFront", "tyreRear"] },
  { key: "chargeLimit", section: "charging", title: "How full do owners charge?", metrics: ["chargeLimit"] },
  { key: "plugLevel", section: "charging", title: "What level do owners plug in at?", metrics: ["plugLevel"] },
  { key: "chargesWeek", section: "charging", title: "How often do owners charge?", metrics: ["chargesWeek"] },
  { key: "dcShare", section: "charging", title: "Do owners charge slow or fast?", metrics: ["dcShare"] },
  { key: "plugHours", section: "charging", title: "When do owners plug in?", metrics: ["plugHours"] },
  { key: "kmWeek", section: "driving", title: "How far do owners drive?", metrics: ["kmWeek"] },
  { key: "driveLength", section: "driving", title: "How long is a usual drive?", metrics: ["driveLength"] },
  { key: "driveHours", section: "driving", title: "When do owners drive?", metrics: ["driveHours"] },
  { key: "hardPer100", section: "driving", title: "How often do owners brake or speed up hard?", metrics: ["hardPer100"] },
  {
    key: "onePedal",
    section: "driving",
    title: "How much do owners slow down without the brake?",
    metrics: ["onePedal"],
    info: "Worked out from how the car slowed, not from its regen setting.",
  },
  { key: "regenShare", section: "driving", title: "How much does regen give back?", metrics: ["regenShare"] },
  { key: "speeds", section: "driving", title: "How fast do owners drive?", metrics: ["speeds"] },
  { key: "cabinSet", section: "comfort", title: "What temperature do owners set?", metrics: ["cabinSet"] },
  { key: "acShare", section: "comfort", title: "How much do owners drive with the AC on?", metrics: ["acShare"] },
  {
    key: "cooling",
    section: "comfort",
    title: "What else do owners use?",
    metrics: ["seatCooling", "climateKeeper", "dogMode", "campMode"],
    list: true,
  },
  { key: "overheat", section: "comfort", title: "Is Cabin Overheat Protection on?", metrics: ["overheat"] },
  { key: "sentry", section: "parked", title: "How much do owners use Sentry Mode?", metrics: ["sentryUsed", "sentryHours"] },
  {
    key: "settings",
    section: "settings",
    metrics: [
      "pinToDrive",
      "sentryUsed",
      "scheduledCharging",
      "laneEmergency",
      "emergencyBraking",
      "blindSpotChime",
      "blindSpotCamera",
      "speedLimitWarning",
      "collisionWarning",
      "laneAvoidance",
      "followDistance",
      "keys",
    ],
    list: true,
  },
  { key: "installs", section: "software", title: "How soon do owners install updates?", metrics: ["installWait", "installNight"] },
  { key: "model", section: "identity", title: "Which models?", metrics: ["model"] },
  { key: "paint", section: "identity", title: "Which colours?", metrics: ["paint"] },
  { key: "wheels", section: "identity", title: "Which wheels?", metrics: ["wheels"] },
];

// ---- One car's 30 days ----

export type CarSummary = {
  vinHash: string;
  owner: number; // the account, for the count of owners; never published per car
  days: number;
  segment: string | null; // segmentOf
  lfp: boolean;
  values: Record<MetricKey, Value | null>;
};

export function summarise(days: CarDay[], car: { vinHash: string; owner: number }, latest: Latest | null = null): CarSummary {
  const t = totalsOf(days, latest);
  const counts = have(t);
  const values = Object.fromEntries(METRICS.map((m) => [m.key, meets(m.need, counts) ? m.value(t) : null])) as Record<MetricKey, Value | null>;
  return { vinHash: car.vinHash, owner: car.owner, days: t.days, segment: segmentOf(t.latest), lfp: t.latest?.lfp ?? false, values };
}

// ---- What is published ----

// A bin covers [from, to); a null end is open: "40 or less", "1,000 or more".
export type Bin = { from: number | null; to: number | null; cars: number };
export type SpreadStat = { kind: "spread"; cars: number; bins: Bin[]; low: number; high: number };
export type ChoiceStat = { kind: "choice"; cars: number; options: { key: string; share: number }[] };
export type HoursStat = { kind: "hours"; cars: number; shares: number[]; rush: number | null; weekend: number | null };
export type ShareStat = { kind: "share"; cars: number; share: number };
export type Stat = SpreadStat | ChoiceStat | HoursStat | ShareStat;
// `all` for a metric compared across every car; `groups` by model or battery kind, each of at least MIN_CARS.
export type MetricStats = { all?: Stat; groups?: Record<string, Stat> };
export type OwnerStats = { v: number; owners: number; cars: number; metrics: Partial<Record<MetricKey, MetricStats>> };

export const OTHER = "other";

// Float noise off, so 0.6 / 0.2 is 3, not 2.9999999999999996.
const snap = (x: number) => Math.round(x * 1e9) / 1e9;
// A value's bin, counted in steps from zero.
const binIndex = (v: number, step: number) => Math.floor(snap(v / step));

// The value below which a share q of the sorted values fall, between the two nearest values.
export function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

// The middle half (25th to 75th percentile) widened out to whole steps, so the range always holds at least
// half the cars, and cars per bin. Bins are a step wide; a spread too wide for MAX_BINS of them folds its
// far ends (past the 5th and 95th percentiles) into open bins, then doubles the width until it fits.
export function spreadStat(values: number[], step: number): SpreadStat {
  const sorted = [...values].sort((a, b) => a - b);
  const low = snap(binIndex(quantile(sorted, 0.25), step) * step);
  let high = snap(Math.ceil(snap(quantile(sorted, 0.75) / step)) * step);
  if (high <= low) high = snap(low + step);
  let width = step;
  let first = 0;
  let last = 0;
  for (;;) {
    first = binIndex(sorted[0], width);
    last = binIndex(sorted[sorted.length - 1], width);
    if (last - first + 1 > MAX_BINS) {
      first = binIndex(quantile(sorted, 0.05), width);
      last = binIndex(quantile(sorted, 0.95), width);
    }
    if (last - first + 1 <= MAX_BINS) break;
    width *= 2;
  }
  const edge = (i: number) => snap(i * width);
  const index = sorted.map((v) => binIndex(v, width));
  const bins: Bin[] = [];
  const under = index.filter((i) => i < first).length;
  if (under) bins.push({ from: null, to: edge(first), cars: under });
  for (let i = first; i <= last; i++) bins.push({ from: edge(i), to: edge(i + 1), cars: index.filter((j) => j === i).length });
  const over = index.filter((i) => i > last).length;
  if (over) {
    const top = bins[bins.length - 1];
    top.to = null;
    top.cars += over;
  }
  return { kind: "spread", cars: values.length, bins, low, high };
}

function choiceStat(m: ChoiceMetric, values: (string | number[])[]): ChoiceStat {
  const n = values.length;
  if (m.mix && Array.isArray(m.options)) {
    const rows = values as number[][];
    return { kind: "choice", cars: n, options: m.options.map((o, k) => ({ key: o.key, share: sum(rows.map((r) => r[k] ?? 0)) / n })) };
  }
  const counts = new Map<string, number>();
  for (const v of values as string[]) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (m.other) {
    let other = 0;
    for (const [key, count] of counts) if (count < OTHER_MIN) (other += count), counts.delete(key);
    if (other) counts.set(OTHER, other);
  }
  const order = Array.isArray(m.options)
    ? m.options.map((o) => o.key).filter((k) => counts.has(k))
    : [...counts.keys()].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : counts.get(b)! - counts.get(a)! || a.localeCompare(b)));
  return { kind: "choice", cars: n, options: order.map((key) => ({ key, share: counts.get(key)! / n })) };
}

function hoursStat(values: HoursValue[]): HoursStat {
  const n = values.length;
  const mean = (list: number[]) => (list.length ? sum(list) / list.length : null);
  return {
    kind: "hours",
    cars: n,
    shares: zeros(24).map((_, h) => sum(values.map((v) => v.shares[h] ?? 0)) / n),
    rush: mean(values.flatMap((v) => (v.rush === undefined ? [] : [v.rush]))),
    weekend: mean(values.flatMap((v) => (v.weekend === undefined ? [] : [v.weekend]))),
  };
}

function statOf(m: Metric, values: Value[]): Stat {
  if (m.kind === "spread") return spreadStat(values as number[], m.step);
  if (m.kind === "choice") return choiceStat(m, values as (string | number[])[]);
  if (m.kind === "hours") return hoursStat(values as HoursValue[]);
  return { kind: "share", cars: values.length, share: sum(values as number[]) / values.length };
}

export const BATTERY_GROUPS = { lfp: "lfp", other: "other" } as const;

function groupOf(m: Metric, s: CarSummary): string | null {
  if (m.segment === "model") return s.segment;
  if (m.segment === "battery") return s.lfp ? BATTERY_GROUPS.lfp : BATTERY_GROUPS.other;
  return "all";
}

// A car two accounts share counts once: the copy with the most days, then the lower account.
export function oneCopyPerCar(summaries: CarSummary[]): CarSummary[] {
  const best = new Map<string, CarSummary>();
  for (const s of summaries) {
    const seen = best.get(s.vinHash);
    if (!seen || s.days > seen.days || (s.days === seen.days && s.owner < seen.owner)) best.set(s.vinHash, s);
  }
  return [...best.values()];
}

// The published totals. A metric, or a group of one, with fewer than MIN_CARS cars or fewer than MIN_CARS
// owners is left out entirely, so not even its name says such a car exists. Owners count too: one owner's
// four cars and a fifth owner's would otherwise publish that fifth car's value to the first owner.
export function aggregate(summaries: CarSummary[]): OwnerStats {
  const cars = oneCopyPerCar(summaries);
  const metrics: OwnerStats["metrics"] = {};
  for (const m of METRICS) {
    const groups = new Map<string, { values: Value[]; owners: Set<number> }>();
    for (const s of cars) {
      const value = s.values[m.key];
      const group = groupOf(m, s);
      if (value === null || value === undefined || group === null) continue;
      const g = groups.get(group) ?? { values: [], owners: new Set<number>() };
      g.values.push(value);
      g.owners.add(s.owner);
      groups.set(group, g);
    }
    const stats = Object.fromEntries(
      [...groups].filter(([, g]) => g.values.length >= MIN_CARS && g.owners.size >= MIN_CARS).map(([group, g]) => [group, statOf(m, g.values)]),
    );
    if (Object.keys(stats).length === 0) continue;
    metrics[m.key] = m.segment === "all" ? { all: stats.all } : { groups: stats };
  }
  return { v: STATS_VERSION, owners: new Set(cars.map((s) => s.owner)).size, cars: cars.length, metrics };
}

// The stat a car is compared with: its own group's, never another group's.
export function statFor(stats: OwnerStats, key: MetricKey, group: string | null): Stat | null {
  const entry = stats.metrics[key];
  if (!entry) return null;
  if (metric(key).segment === "all") return entry.all ?? null;
  return group === null ? null : (entry.groups?.[group] ?? null);
}

// Who is looking: their own summary (null until their days are worked out), their model group and battery.
export type Viewer = { you: CarSummary | null; group: string | null; lfp: boolean };

// The group a metric compares the viewer with: their model group, their battery kind, or everyone ("all").
export function viewerGroup(key: MetricKey, v: Viewer): string | null {
  const m = metric(key);
  return m.segment === "model" ? v.group : m.segment === "battery" ? (v.lfp ? BATTERY_GROUPS.lfp : BATTERY_GROUPS.other) : "all";
}

// The stat the viewer's car is compared with. A model group under MIN_CARS has none: never all models instead.
export const viewerStat = (stats: OwnerStats, key: MetricKey, v: Viewer): Stat | null => statFor(stats, key, metric(key).segment === "all" ? null : viewerGroup(key, v));

// The viewer's own value, only when their car is in the group the stat is for.
export function viewerValue(key: MetricKey, v: Viewer): Value | null {
  if (!v.you || (metric(key).segment === "model" && v.you.segment !== v.group)) return null;
  return v.you.values[key] ?? null;
}

// ---- Where a car sits ----

export type Place = "lower" | "middle" | "higher";
export const PLACE_WORDS: Record<Place, string> = { lower: "lower than most", middle: "about the middle", higher: "higher than most" };

// "Lower than most" only below the middle half's low end: below the 25th percentile, so lower than at least
// 75% of cars. The value is compared as it is shown (`digits`), against the range as the headline shows it,
// so the two sentences can't disagree.
export function place(value: number, stat: SpreadStat, digits = 9): Place {
  const shown = Number(value.toFixed(digits));
  if (shown < stat.low) return "lower";
  if (shown > stat.high) return "higher";
  return "middle";
}

// ---- Words ----

const stepDigits = (step: number) => (Number.isInteger(step) ? 0 : String(step).split(".")[1].length);

export function formatValue(m: SpreadMetric, value: number, digits = m.digits): string {
  return m.unit === "%" ? formatPercent(value, digits) : formatNumber(value, digits);
}

// "120 to 140 Wh/km", "30% to 50%".
export function rangeWords(m: SpreadMetric, low: number, high: number): string {
  const d = stepDigits(m.step);
  if (m.unit === "%") return `${formatPercent(low, d)} to ${formatPercent(high, d)}`;
  return `${formatNumber(low, d)} to ${formatNumber(high, d)} ${m.unit}`;
}

// A bin's start under the axis: "120", "0.4", "30%".
export function edgeWords(m: SpreadMetric, v: number): string {
  const d = stepDigits(m.step);
  return m.unit === "%" ? formatPercent(v, d) : formatNumber(v, d);
}

// A bin's span for its tip: "120 to 130 Wh/km", "40 or less", "1,000 or more".
export function binWords(m: SpreadMetric, bin: Bin): string {
  const d = stepDigits(m.step);
  const n = (v: number) => (m.unit === "%" ? formatPercent(v, d) : formatNumber(v, d));
  const unit = m.unit === "%" ? "" : ` ${m.unit}`;
  if (bin.from === null) return `Under ${n(bin.to!)}${unit}`;
  if (bin.to === null) return `${n(bin.from)}${unit} or more`;
  return m.unit === "%" ? `${n(bin.from)} to ${n(bin.to)}` : `${n(bin.from)} to ${n(bin.to)}${unit}`;
}

export const halfLine = (m: SpreadMetric, stat: SpreadStat) => m.half(rangeWords(m, stat.low, stat.high));

export function youLine(m: SpreadMetric, value: number, stat: SpreadStat): string {
  return m.you(formatValue(m, value), PLACE_WORDS[place(value, stat, m.digits)]);
}

export function optionLabel(m: ChoiceMetric, key: string): string {
  if (key === OTHER) return "Other";
  if (!Array.isArray(m.options)) return key;
  return m.options.find((o) => o.key === key)?.label ?? key;
}

const optionSays = (m: ChoiceMetric, key: string) => (Array.isArray(m.options) ? (m.options.find((o) => o.key === key)?.says ?? optionLabel(m, key)) : key);

export const percentOf = (share: number) => formatPercent(share * 100);

// The most common option, Other aside, as the metric's sentence.
export function topLine(m: ChoiceMetric, stat: ChoiceStat): string | null {
  const top = stat.options.filter((o) => o.key !== OTHER).reduce<ChoiceStat["options"][number] | null>((a, o) => (!a || o.share > a.share ? o : a), null);
  return top && m.top ? m.top(optionSays(m, top.key), percentOf(top.share)) : null;
}

export function youChoiceLine(m: ChoiceMetric, key: string): string | null {
  return m.you ? m.you(optionSays(m, key)) : null;
}

// The hour with the largest share.
export const busiestHour = (shares: number[]) => shares.reduce((best, v, h) => (v > shares[best] ? h : best), 0);
export const hourWords = (h: number) => formatHours(h, (h + 1) % 24);

// "Owners plug in most often 10 PM to 11 PM.", "Driving peaks 9 AM to 10 AM. 41% of it is in weekday rush
// hours and 26% on weekends."
export function hoursLine(key: MetricKey, stat: HoursStat): string {
  const busiest = hourWords(busiestHour(stat.shares));
  if (key === "plugHours") return `Owners plug in most often ${busiest}.`;
  const parts = [`Driving peaks ${busiest}.`];
  if (stat.rush !== null && stat.weekend !== null) parts.push(`${percentOf(stat.rush)} of it is in weekday rush hours and ${percentOf(stat.weekend)} on weekends.`);
  return parts.join(" ");
}

export function youHoursLine(key: MetricKey, value: HoursValue): string {
  const busiest = hourWords(busiestHour(value.shares));
  return key === "plugHours" ? `You most often plug in ${busiest}.` : `You drive most ${busiest}.`;
}

export const nightLine = (share: number) => `${percentOf(share)} of installs happen at night, 10 PM to 6 AM.`;
export const sentryLine = (share: number) => `${percentOf(share)} of owners used Sentry Mode.`;
// Which cars the charge limit bars are for.
export const batteryLine = (lfp: boolean) => (lfp ? "Cars with an LFP battery, like yours. LFP is fine charged to 100%." : "Cars without an LFP battery, like yours.");
export const carsWords = (n: number) => `${formatNumber(n, 0)} ${n === 1 ? "car" : "cars"}`;

// ---- Settings owners keep, in groups ----

// The settings list in a few groups, each a row of its own that opens to its settings. `lead` is the setting
// the closed row's line is about.
export const SETTING_GROUPS: { key: string; title: string; lead: MetricKey; metrics: MetricKey[] }[] = [
  { key: "safety", title: "Safety", lead: "collisionWarning", metrics: ["collisionWarning", "emergencyBraking", "laneAvoidance", "laneEmergency", "blindSpotChime", "blindSpotCamera"] },
  { key: "driving", title: "Driving", lead: "speedLimitWarning", metrics: ["speedLimitWarning", "followDistance"] },
  { key: "security", title: "Security", lead: "sentryUsed", metrics: ["pinToDrive", "sentryUsed"] },
  { key: "comfort", title: "Charging and comfort", lead: "scheduledCharging", metrics: ["scheduledCharging", "overheat"] },
  { key: "keys", title: "Keys", lead: "keys", metrics: ["keys"] },
];

// A group's closed line, from its lead setting: "Most keep forward collision warning on Average.",
// "38% of owners have scheduled charging on.", "62% of owners used Sentry Mode."
export function settingLine(key: MetricKey, stat: Stat): string | null {
  const m = metric(key);
  if (m.kind !== "choice" || stat.kind !== "choice") return null;
  const name = m.name ?? m.label ?? "";
  if (Array.isArray(m.options) && m.options[0]?.key === "on" && m.options.length === 2) {
    const on = percentOf(stat.options.find((o) => o.key === "on")?.share ?? 0);
    return m.yes === "used" ? `${on} of owners used ${name}.` : `${on} of owners have ${name} on.`;
  }
  const top = stat.options.filter((o) => o.key !== OTHER).reduce<ChoiceStat["options"][number] | null>((a, o) => (!a || o.share > a.share ? o : a), null);
  if (!top) return null;
  const option = optionLabel(m, top.key);
  if (key === "keys") return top.share > 0.5 ? `Most owners have ${option} phone keys and key fobs.` : `${percentOf(top.share)} of owners have ${option} phone keys and key fobs, the most common.`;
  return top.share > 0.5 ? `Most keep ${name} on ${option}.` : `${percentOf(top.share)} of owners keep ${name} on ${option}, the most common.`;
}

// ---- Picked for you ----

// The comparisons a highlight can be about: ones an owner can act on or would want to know. `weight` is how
// useful it is (1 the most); a highlight's score is how far the car is from the middle, times its weight.
// `group`: at most one highlight per group (Sentry Mode's use and its hours). Sentences lead with the owner
// and say only how the car compares, never why.
type SpreadPick = {
  key: MetricKey;
  weight: number;
  group?: string;
  more: (value: string, range: string) => string;
  less: (value: string, range: string) => string;
  same: (value: string) => string;
  // "About 3 times" the middle half's centre, for a value at least twice it.
  times?: (n: number, value: string) => string;
};
type ChoicePick = {
  key: MetricKey;
  weight: number;
  group?: string;
  // `most`: the top option has more than half the owners.
  odd: (yours: string, top: string, topShare: string, most: boolean, yourShare: string) => string;
  same: (yours: string, most: boolean, yourShare: string) => string;
};

const SPREAD_PICKS: SpreadPick[] = [
  {
    key: "energy",
    weight: 1,
    more: (v, r) => `Your car uses ${v}, more than most cars like yours. Half use ${r}.`,
    less: (v, r) => `Your car uses ${v}, less than most cars like yours. Half use ${r}.`,
    same: (v) => `Your car uses ${v}, about the middle for cars like yours.`,
  },
  {
    key: "parkedLoss",
    weight: 1,
    more: (v, r) => `Your car loses ${v} while parked, more than most cars like yours. Half lose ${r}.`,
    less: (v, r) => `Your car loses ${v} while parked, less than most cars like yours. Half lose ${r}.`,
    same: (v) => `Your car loses ${v} while parked, about the middle for cars like yours.`,
    times: (n, v) => `Your car loses about ${n} times the charge of cars like yours while parked, ${v}.`,
  },
  {
    key: "sentryHours",
    weight: 0.8,
    group: "sentry",
    more: (v, r) => `You run Sentry Mode ${v}, more than most owners who use it. Half run it ${r}.`,
    less: (v, r) => `You run Sentry Mode ${v}, less than most owners who use it. Half run it ${r}.`,
    same: (v) => `You run Sentry Mode ${v}, about the middle for owners who use it.`,
    times: (n, v) => `You run Sentry Mode about ${n} times as long as a typical owner who uses it, ${v}.`,
  },
  {
    key: "plugLevel",
    weight: 0.7,
    more: (v, r) => `You plug in at ${v}, higher than most owners. Half plug in at ${r}.`,
    less: (v, r) => `You plug in at ${v}, lower than most owners. Half plug in at ${r}.`,
    same: (v) => `You plug in at ${v}, about the middle.`,
  },
  {
    key: "chargesWeek",
    weight: 0.6,
    more: (v, r) => `You charge ${v}, more often than most owners. Half charge ${r}.`,
    less: (v, r) => `You charge ${v}, less often than most owners. Half charge ${r}.`,
    same: (v) => `You charge ${v}, about the middle.`,
  },
  {
    key: "kmWeek",
    weight: 0.6,
    more: (v, r) => `You drive ${v}, more than most owners. Half drive ${r}.`,
    less: (v, r) => `You drive ${v}, less than most owners. Half drive ${r}.`,
    same: (v) => `You drive ${v}, about the middle.`,
    times: (n, v) => `You drive about ${n} times as far as a typical owner, ${v}.`,
  },
  {
    key: "acShare",
    weight: 0.5,
    more: (v, r) => `You drive with the AC on ${v} of the time, more than most owners. Half have it on ${r} of the time.`,
    less: (v, r) => `You drive with the AC on ${v} of the time, less than most owners. Half have it on ${r} of the time.`,
    same: (v) => `You drive with the AC on ${v} of the time, about the middle.`,
  },
  {
    key: "rushShare",
    weight: 0.5,
    more: (v, r) => `You do ${v} of your driving in weekday rush hours, more than most owners. Half do ${r}.`,
    less: (v, r) => `You do ${v} of your driving in weekday rush hours, less than most owners. Half do ${r}.`,
    same: (v) => `You do ${v} of your driving in weekday rush hours, about the middle.`,
  },
];

const CHOICE_PICKS: ChoicePick[] = [
  {
    key: "chargeLimit",
    weight: 0.9,
    odd: (y, top, share, most) =>
      most ? `You charge to ${y}. Most owners with your battery charge to ${top}.` : `You charge to ${y}. The most common limit with your battery is ${top}, set by ${share} of owners.`,
    same: (y, most) => (most ? `You charge to ${y}, like most owners with your battery.` : `You charge to ${y}, the most common limit with your battery.`),
  },
  {
    key: "sentryUsed",
    weight: 0.8,
    group: "sentry",
    odd: (y, _top, _share, _most, mine) => (y === "On" ? `You use Sentry Mode. ${mine} of owners do.` : `You don't use Sentry Mode. Most owners do.`),
    same: (y, _most, mine) => (y === "On" ? `You use Sentry Mode, like ${mine} of owners.` : `You don't use Sentry Mode, like ${mine} of owners.`),
  },
  {
    key: "cabinSet",
    weight: 0.4,
    odd: (y, top, share, most) => (most ? `You set the cabin to ${y}. Most owners set ${top}.` : `You set the cabin to ${y}. The most common is ${top}, set by ${share} of owners.`),
    same: (y, most) => (most ? `You set the cabin to ${y}, like most owners.` : `You set the cabin to ${y}, the most common setting.`),
  },
];

export const HIGHLIGHT_MIN = 3;
export const HIGHLIGHT_MAX = 5;

export type Highlight =
  | { kind: "spread"; key: MetricKey; line: string; score: number; middle: boolean; stat: SpreadStat; value: number }
  | { kind: "choice"; key: MetricKey; line: string; score: number; middle: boolean; stat: ChoiceStat; value: string };

// "128 Wh/km", "72%", "2.5 times a week": a figure with its unit, for a sentence.
export function valueWords(m: SpreadMetric, value: number): string {
  return m.unit === "%" ? formatValue(m, value) : `${formatValue(m, value)} ${m.unit}`;
}

// Where a value falls among the cars, 0 to 1, from the bins: the cars in bins below it, and half its own bin's.
export function standing(stat: SpreadStat, value: number): number {
  let below = 0;
  for (const b of stat.bins) {
    const inBin = (b.from === null || value >= b.from) && (b.to === null || value < b.to);
    if (inBin) return (below + b.cars / 2) / stat.cars;
    below += b.cars;
  }
  return below / stat.cars;
}

function spreadHighlight(p: SpreadPick, stats: OwnerStats, v: Viewer): Highlight | null {
  const m = metric(p.key);
  const stat = viewerStat(stats, p.key, v);
  const value = viewerValue(p.key, v);
  if (m.kind !== "spread" || stat?.kind !== "spread" || typeof value !== "number" || stat.cars < MIN_CARS) return null;
  const where = place(value, stat, m.digits);
  const shown = valueWords(m, value);
  const range = rangeWords(m, stat.low, stat.high);
  const centre = (stat.low + stat.high) / 2;
  const ratio = centre > 0 ? value / centre : 0;
  const line =
    where === "middle" ? p.same(shown) : where === "higher" && p.times && ratio >= 2 ? p.times(Math.round(ratio), shown) : where === "higher" ? p.more(shown, range) : p.less(shown, range);
  const distance = Math.min(1, Math.abs(standing(stat, value) - 0.5) * 2);
  return { kind: "spread", key: p.key, line, score: distance * p.weight, middle: where === "middle", stat, value };
}

function choiceHighlight(p: ChoicePick, stats: OwnerStats, v: Viewer): Highlight | null {
  const m = metric(p.key);
  const stat = viewerStat(stats, p.key, v);
  const value = viewerValue(p.key, v);
  if (m.kind !== "choice" || stat?.kind !== "choice" || typeof value !== "string" || stat.cars < MIN_CARS) return null;
  const top = stat.options.filter((o) => o.key !== OTHER).reduce<ChoiceStat["options"][number] | null>((a, o) => (!a || o.share > a.share ? o : a), null);
  if (!top) return null;
  const mine = stat.options.find((o) => o.key === value)?.share ?? 0;
  const most = top.share > 0.5;
  const yours = optionLabel(m, value);
  const middle = value === top.key || mine >= top.share;
  const line = middle ? p.same(yours, most, percentOf(mine)) : p.odd(yours, optionLabel(m, top.key), percentOf(top.share), most, percentOf(mine));
  // How much rarer the owner's option is than the most common one: 0 when it is the most common.
  const distance = middle ? 0 : (top.share - mine) / top.share;
  return { kind: "choice", key: p.key, line, score: distance * p.weight, middle, stat, value };
}

const PICK_INFO = new Map<MetricKey, { weight: number; group: string }>([...SPREAD_PICKS, ...CHOICE_PICKS].map((p) => [p.key, { weight: p.weight, group: p.group ?? p.key }]));

// The 3 to 5 comparisons where the owner's car differs most from the others, most different first. A
// comparison where the car is about the middle only fills in when fewer than 3 differ, the most useful first.
// Only figures the page shows count: a group under MIN_CARS has no stat, so it is never a highlight.
export function highlights(stats: OwnerStats, v: Viewer): Highlight[] {
  if (!v.you) return [];
  const all = [...SPREAD_PICKS.map((p) => spreadHighlight(p, stats, v)), ...CHOICE_PICKS.map((p) => choiceHighlight(p, stats, v))].filter((h): h is Highlight => h !== null);
  const weight = (h: Highlight) => PICK_INFO.get(h.key)!.weight;
  const odd = all.filter((h) => !h.middle).sort((a, b) => b.score - a.score || weight(b) - weight(a));
  const middle = all.filter((h) => h.middle).sort((a, b) => weight(b) - weight(a));
  const picked: Highlight[] = [];
  const groups = new Set<string>();
  const add = (list: Highlight[], until: number) => {
    for (const h of list) {
      if (picked.length >= until) return;
      const group = PICK_INFO.get(h.key)!.group;
      if (groups.has(group)) continue;
      groups.add(group);
      picked.push(h);
    }
  };
  add(odd, HIGHLIGHT_MAX);
  add(middle, HIGHLIGHT_MIN);
  return picked;
}

// A model group's key ("Model Y · Standard Range · Rear-wheel drive") as a name: "Model Y Standard Range".
export const modelName = (key: string) => key.split(" · ").slice(0, 2).join(" ");

// The facts under the highlights: "Most common car: Model Y Standard Range · Busiest plug-in hour: 10 PM".
export function factLine(stats: OwnerStats, hour: (h: number) => string): string | null {
  const parts: string[] = [];
  const models = stats.metrics.model?.all;
  if (models?.kind === "choice") {
    const top = models.options.filter((o) => o.key !== OTHER).sort((a, b) => b.share - a.share)[0];
    if (top) parts.push(`Most common car: ${modelName(top.key)}`);
  }
  const plugs = stats.metrics.plugHours?.all;
  if (plugs?.kind === "hours") parts.push(`Busiest plug-in hour: ${hour(busiestHour(plugs.shares))}`);
  return parts.length ? parts.join(" · ") : null;
}

// ---- For the owner's own AI (the connector's get_owner_comparisons) ----

// A metric's name for an AI: the card's question, or the setting's name.
const AI_LABELS: Partial<Record<MetricKey, string>> = {
  tyreFront: "Front tyre pressure owners keep",
  tyreRear: "Rear tyre pressure owners keep",
  rushShare: "Share of driving in weekday rush hours (8 AM to 11 AM and 5 PM to 9 PM)",
  sentryHours: "Sentry Mode hours a day, among owners who use it",
  installNight: "Share of updates installed at night (10 PM to 6 AM)",
  model: "Which models owners drive",
  paint: "Which colours owners drive",
  wheels: "Which wheels owners drive",
};

function aiLabel(key: MetricKey): string {
  const m = metric(key);
  if (AI_LABELS[key]) return AI_LABELS[key]!;
  if (m.kind === "choice" && m.label) return m.label;
  return CARDS.find((c) => c.metrics.includes(key))?.title ?? key;
}

const GROUP_WORDS = { all: "all owners who share", lfp: "owners whose car has an LFP battery", other: "owners whose car has a battery that isn't LFP" };
const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;
const pct = (share: number) => round(share * 100);

// One stat as plain JSON for an AI: totals only, never a car's value.
function statJson(m: Metric, stat: Stat) {
  if (m.kind === "spread" && stat.kind === "spread") {
    return {
      unit: m.unit,
      middle_half: { from: stat.low, to: stat.high, note: "Half of these cars fall in this range." },
      cars_per_range: stat.bins.map((b) => ({ from: b.from, to: b.to, cars: b.cars })),
    };
  }
  if (m.kind === "choice" && stat.kind === "choice") {
    return m.mix
      ? { unit: "average % of driving time", options: stat.options.map((o) => ({ option: optionLabel(m, o.key), percent: pct(o.share) })) }
      : { unit: "% of owners", options: stat.options.map((o) => ({ option: optionLabel(m, o.key), percent: pct(o.share) })) };
  }
  if (m.kind === "hours" && stat.kind === "hours") {
    return {
      unit: "% of the day's total, by IST hour (each car counts equally)",
      by_hour: stat.shares.map((share, h) => ({ hour: h, percent: pct(share) })),
      ...(stat.rush !== null ? { weekday_rush_hours_percent: pct(stat.rush) } : {}),
      ...(stat.weekend !== null ? { weekend_percent: pct(stat.weekend) } : {}),
    };
  }
  if (stat.kind === "share") return { unit: "% of installs", percent: pct(stat.share) };
  return {};
}

// The viewer's own figure and where it sits, for their group only.
function yoursJson(m: Metric, stat: Stat, value: Value | null) {
  if (value === null) return null;
  if (m.kind === "spread" && stat.kind === "spread" && typeof value === "number") return { value: round(value, Math.max(1, m.digits)), unit: m.unit, place: PLACE_WORDS[place(value, stat, m.digits)] };
  if (m.kind === "choice" && m.mix && Array.isArray(value)) return { options: stat.kind === "choice" ? stat.options.map((o, k) => ({ option: optionLabel(m, o.key), percent: pct(value[k] ?? 0) })) : [] };
  if (m.kind === "choice" && typeof value === "string") return { option: optionLabel(m, value) };
  if (m.kind === "hours" && typeof value === "object" && !Array.isArray(value)) return { busiest_hour: busiestHour(value.shares) };
  if (m.kind === "share" && typeof value === "number") return { percent: pct(value) };
  return null;
}

function groupWords(m: Metric, group: string): string {
  if (m.segment === "model") return `owners of a ${group}`;
  return GROUP_WORDS[group as keyof typeof GROUP_WORDS] ?? group;
}

export type Comparison = {
  key: MetricKey;
  label: string;
  compared_with: string;
  yours_is_this_group: boolean;
  cars: number;
  figures: ReturnType<typeof statJson>;
  yours: ReturnType<typeof yoursJson>;
};

// Every published figure, with the viewer's own in their group. Model and battery figures come for every group
// that has MIN_CARS cars, so "what do Model Y Premium owners use" can be answered too.
export function comparisons(stats: OwnerStats, v: Viewer): Comparison[] {
  const out: Comparison[] = [];
  for (const m of METRICS) {
    const entry = stats.metrics[m.key];
    if (!entry) continue;
    const groups: [string, Stat][] = m.segment === "all" ? (entry.all ? [["all", entry.all]] : []) : Object.entries(entry.groups ?? {});
    const mine = viewerGroup(m.key, v);
    for (const [group, stat] of groups) {
      if (stat.cars < MIN_CARS) continue;
      const own = group === mine;
      out.push({
        key: m.key,
        label: aiLabel(m.key),
        compared_with: groupWords(m, group),
        yours_is_this_group: own,
        cars: stat.cars,
        figures: statJson(m, stat),
        yours: own ? yoursJson(m, stat, viewerValue(m.key, v)) : null,
      });
    }
  }
  return out;
}
