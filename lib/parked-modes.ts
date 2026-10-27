// What kept the car busy while parked, from the modes it reported: Sentry Mode, Climate Keeper (Keep, Dog and
// Camp) and Cabin Overheat Protection. A tip names one of these only when the car reported it on (lib/ai-tips.ts
// causes), never as a guess. Pure, so tested (test/parked-modes.test.ts).
import type { ParkedPeriod } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";

export const MODE_FIELDS = ["SentryMode", "ClimateKeeperMode", "CabinOverheatProtectionMode"] as const;
export type ModeField = (typeof MODE_FIELDS)[number];
export type ModeReadings = Partial<Record<ModeField, Reading[]>>;
export type ModeTimes = { sentryMs: number; keeperMs: number; overheatMs: number };

// "SentryModeStateArmed", "ClimateKeeperModeStateDog", "CabinOverheatProtectionModeStateFanOnly": on unless Off.
const isOn = (value: unknown) => typeof value === "string" && !/Off$/.test(value);

// How long a mode was on inside [from, to): each reading holds until the next. The car sends a mode only when
// it changes, so the state at `from` is the last reading before it.
export function onMsIn(readings: Reading[] | undefined, from: number, to: number): number {
  if (!readings || readings.length === 0 || to <= from) return 0;
  const sorted = [...readings].map((r) => ({ at: Date.parse(r.at), on: isOn(r.value) })).sort((a, b) => a.at - b.at);
  let total = 0;
  for (let k = 0; k < sorted.length; k++) {
    if (!sorted[k].on) continue;
    const start = Math.max(from, sorted[k].at);
    const end = Math.min(to, sorted[k + 1]?.at ?? to);
    if (end > start) total += end - start;
  }
  return total;
}

// The modes' time on in one parked stretch. A mode only draws while the car is awake, and the car sends
// nothing while asleep, so each is held to the time it was seen awake.
export function modesWhileParked(p: ParkedPeriod, modes: ModeReadings): ModeTimes {
  const held = (field: ModeField) => Math.min(onMsIn(modes[field], p.start, p.end), p.awakeMs);
  return { sentryMs: held("SentryMode"), keeperMs: held("ClimateKeeperMode"), overheatMs: held("CabinOverheatProtectionMode") };
}

export function sumModes(list: ModeTimes[]): ModeTimes {
  return list.reduce((a, m) => ({ sentryMs: a.sentryMs + m.sentryMs, keeperMs: a.keeperMs + m.keeperMs, overheatMs: a.overheatMs + m.overheatMs }), { sentryMs: 0, keeperMs: 0, overheatMs: 0 });
}
