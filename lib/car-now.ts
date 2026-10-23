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

export type CarNow = { rows: [string, string][]; tyres: [string, string][]; tyreWarning: string | null; since: string | null };

export function carNow(stream: Stream): CarNow {
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
  const tyres: [string, string | null][] = [
    ["Front left", bar(v("TpmsPressureFl"))],
    ["Front right", bar(v("TpmsPressureFr"))],
    ["Rear left", bar(v("TpmsPressureRl"))],
    ["Rear right", bar(v("TpmsPressureRr"))],
  ];
  const hard = v("TpmsHardWarnings");
  const soft = v("TpmsSoftWarnings");
  // Warnings arrive as a TireLocation object, a boolean per tyre.
  const warned = (x: unknown) =>
    Array.isArray(x) ? x.length > 0 : typeof x === "object" && x !== null ? Object.values(x).some((w) => w === true) : x === true || (typeof x === "number" && x > 0);
  const times = Object.values(stream).map((r) => Date.parse(r.at));
  return {
    rows: rows.filter((r): r is [string, string] => r[1] !== null),
    tyres: tyres.filter((r): r is [string, string] => r[1] !== null),
    tyreWarning: warned(hard) ? "Tyre pressure warning: check your tyres." : warned(soft) ? "A tyre is a little low." : null,
    since: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
