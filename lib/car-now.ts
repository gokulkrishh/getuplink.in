import type { Stream } from "@/lib/telemetry";

// The car's state right now, from each field's latest streamed reading, in plain words. Pure, so tested.

export const CAR_NOW_FIELDS = [
  "Locked",
  "SentryMode",
  "DoorState",
  "FdWindow",
  "FpWindow",
  "RdWindow",
  "RpWindow",
  "ChargePortDoorOpen",
  "InsideTemp",
  "OutsideTemp",
  "HvacPower",
  "ClimateKeeperMode",
  "CabinOverheatProtectionMode",
  "TpmsPressureFl",
  "TpmsPressureFr",
  "TpmsPressureRl",
  "TpmsPressureRr",
  "TpmsSoftWarnings",
  "TpmsHardWarnings",
  "TpmsLastSeenPressureTimeFl",
  "TpmsLastSeenPressureTimeFr",
  "TpmsLastSeenPressureTimeRl",
  "TpmsLastSeenPressureTimeRr",
];

// "SentryModeStateArmed" -> "Armed", "HvacPowerStateOn" -> "On", "ClimateKeeperModeStateDog" -> "Dog".
export function words(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "string" || !value) return null;
  const tail = /State(?=[A-Z])/.test(value) ? value.replace(/^.*?State(?=[A-Z])/, "") : value.replace(/^.*?Mode(?=[A-Z])/, "");
  return tail.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// DoorState is an object of booleans, true when open: { DriverFront, DriverRear, PassengerFront,
// PassengerRear, TrunkFront, TrunkRear }.
const DOOR_NAMES: Record<string, string> = { TrunkFront: "front trunk", TrunkRear: "boot" };
function doors(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return words(value);
  const open = Object.entries(value as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);
  if (open.length === 0) return "All closed";
  const named = open.filter((k) => DOOR_NAMES[k]).map((k) => DOOR_NAMES[k]);
  const doorsOpen = open.length - named.length;
  return [doorsOpen && `${doorsOpen} ${doorsOpen === 1 ? "door" : "doors"} open`, ...named.map((n) => `${n} open`)].filter(Boolean).join(", ");
}

const temp = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 10) / 10} °C` : null);
const bar = (v: unknown) => (typeof v === "number" ? `${v.toFixed(1)} bar` : null);

type TyreKey = "fl" | "fr" | "rl" | "rr";
const TYRES: [TyreKey, string, string][] = [
  ["fl", "Front left", "Fl"],
  ["fr", "Front right", "Fr"],
  ["rl", "Rear left", "Rl"],
  ["rr", "Rear right", "Rr"],
];
const TYRE_KEYS: Record<string, TyreKey> = { frontleft: "fl", frontright: "fr", rearleft: "rl", rearright: "rr", fl: "fl", fr: "fr", rl: "rl", rr: "rr" };

// Which tyres a warning names, true when warned.
export type TyreFlags = Partial<Record<TyreKey, boolean>>;

// A TireLocation object ({ front_left: true, ... }, any casing) as flags; null for anything else, which
// doesn't say which tyre.
export function tyreFlags(value: unknown): TyreFlags | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const flags: TyreFlags = {};
  for (const [k, v] of Object.entries(value)) {
    const key = TYRE_KEYS[k.toLowerCase().replace(/[^a-z]/g, "")];
    if (key && typeof v === "boolean") flags[key] = v;
  }
  return Object.keys(flags).length ? flags : null;
}

// When a tyre's pressure was last measured, from TpmsLastSeenPressureTime*: Unix seconds or ms, a numeric
// string, an ISO time, or { seconds }. Null when it can't be read, or is before 2015 or in the future. The
// reading's own time is never used: that's when the value changed, not when the tyre was measured.
export function measuredAt(value: unknown, now: number): string | null {
  const raw = typeof value === "object" && value !== null ? (value as { seconds?: unknown }).seconds : value;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const ms = n !== null ? (n < 1e12 ? n * 1000 : n) : typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) && ms >= Date.UTC(2015, 0, 1) && ms <= now + 5 * 60_000 ? new Date(ms).toISOString() : null;
}

// The tyre warnings from the latest online check (vehicle_state's tpms_soft_warning_fl, ...), and when.
export type CheckedTyres = { at: string; soft: TyreFlags; hard: TyreFlags };

// "Front left", "Front left and rear right", "Front left, front right and rear left", "All four tyres".
function names(keys: TyreKey[]): string {
  if (keys.length === 4) return "All four tyres";
  const n = TYRES.filter(([k]) => keys.includes(k)).map(([, name], i) => (i ? name.toLowerCase() : name));
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n[0];
}

export type Tyre = { name: string; pressure: string; measuredAt: string | null; warning: "low" | "very low" | null };

export type CarNow = { rows: [string, string][]; tyres: Tyre[]; tyreWarning: string | null; since: string | null };

// `now` bounds the measured times. `checked` is the latest online check's warnings: whichever of it and
// the streamed warnings is newer says which tyres are low.
export function carNow(stream: Stream, now: number, checked: CheckedTyres | null = null): CarNow {
  const v = (field: string) => stream[field]?.value;
  const windowsOpen = ["FdWindow", "FpWindow", "RdWindow", "RpWindow"].filter((f) => {
    const w = words(v(f));
    return w !== null && !/closed/i.test(w);
  }).length;
  const rows: [string, string | null][] = [
    ["Locked", typeof v("Locked") === "boolean" ? words(v("Locked")) : null],
    ["Sentry Mode", words(v("SentryMode"))],
    ["Doors", doors(v("DoorState"))],
    ["Windows", ["FdWindow", "FpWindow", "RdWindow", "RpWindow"].some((f) => v(f) !== undefined) ? (windowsOpen ? `${windowsOpen} open` : "All closed") : null],
    ["Charge port door", typeof v("ChargePortDoorOpen") === "boolean" ? (v("ChargePortDoorOpen") ? "Open" : "Closed") : null],
    ["Inside", temp(v("InsideTemp"))],
    ["Outside", temp(v("OutsideTemp"))],
    ["Climate", words(v("HvacPower"))],
    ["Climate keeper", words(v("ClimateKeeperMode"))],
    ["Cabin overheat protection", words(v("CabinOverheatProtectionMode"))],
  ];
  // Warnings arrive as a TireLocation object, a boolean per tyre.
  const hard = v("TpmsHardWarnings");
  const soft = v("TpmsSoftWarnings");
  const streamedAt = Math.max(...["TpmsHardWarnings", "TpmsSoftWarnings"].map((f) => (stream[f] ? Date.parse(stream[f].at) : -Infinity)));
  const fromCheck = checked !== null && Date.parse(checked.at) > streamedAt;
  const hardFlags = fromCheck ? checked.hard : tyreFlags(hard);
  const softFlags = fromCheck ? checked.soft : tyreFlags(soft);
  const warnedKeys = (flags: TyreFlags | null) => TYRES.map(([k]) => k).filter((k) => flags?.[k] === true);
  const hardKeys = warnedKeys(hardFlags);
  const softKeys = warnedKeys(softFlags).filter((k) => !hardKeys.includes(k));
  const named = [
    hardKeys.length > 0 && `${names(hardKeys)} ${hardKeys.length === 1 ? "is" : "are"} very low. Check before you drive.`,
    softKeys.length > 0 && `${names(softKeys)} ${softKeys.length === 1 ? "is" : "are"} low.`,
  ].filter(Boolean);
  // A streamed warning that doesn't say which tyre (a list, a count, a plain true, unknown keys).
  const unnamed = (x: unknown, flags: TyreFlags | null) =>
    !fromCheck &&
    flags === null &&
    (Array.isArray(x) ? x.length > 0 : typeof x === "object" && x !== null ? Object.values(x).some((w) => w === true) : x === true || (typeof x === "number" && x > 0));
  const tyreWarning = named.length
    ? named.join(" ")
    : unnamed(hard, hardFlags)
      ? "Tyre pressure warning: check your tyres."
      : unnamed(soft, softFlags)
        ? "A tyre is a little low."
        : null;
  const tyres = TYRES.flatMap(([key, name, suffix]): Tyre[] => {
    const pressure = bar(v(`TpmsPressure${suffix}`));
    if (pressure === null) return [];
    const warning = hardKeys.includes(key) ? "very low" : softKeys.includes(key) ? "low" : null;
    return [{ name, pressure, measuredAt: measuredAt(v(`TpmsLastSeenPressureTime${suffix}`), now), warning }];
  });
  const times = Object.values(stream).map((r) => Date.parse(r.at));
  return {
    rows: rows.filter((r): r is [string, string] => r[1] !== null),
    tyres,
    tyreWarning,
    since: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
