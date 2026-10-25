import { MILES_TO_KM } from "@/lib/car";
import { num, type Reading } from "@/lib/telemetry-derive";

// "2025.32.3 1a2b3c4d" -> "2025.32.3"; the build hash changes nothing for us.
export function normaliseVersion(version: string | null | undefined): string | null {
  const v = version?.trim().split(/\s+/)[0];
  return v && v !== "0.0.0" ? v : null;
}

// The software the car runs now, as every page shows it: the vehicle row's current_version, which the poll
// and the streamed Version readings both move forward (see syncStreamVersions). Until it's set, the newest
// of what was seen: the streamed Version reading or the latest check's car_version. A snapshot's version
// alone can be days behind, since checks don't see an update the car streamed since.
export function currentVersion(current: string | null | undefined, ...seen: ({ version: unknown; at: string } | null | undefined)[]): string | null {
  const fromRow = normaliseVersion(current);
  if (fromRow) return fromRow;
  const known = seen
    .map((s) => s && { version: normaliseVersion(typeof s.version === "string" ? s.version : null), at: Date.parse(s.at) })
    .filter((s): s is { version: string; at: number } => Boolean(s?.version) && Number.isFinite(s!.at))
    .sort((a, b) => b.at - a.at);
  return known[0]?.version ?? null;
}

// Tesla reports the odometer in miles.
export function milesToKm(miles: number): number {
  return Math.round(miles * MILES_TO_KM * 10) / 10;
}

export type VersionStep = { version: string; previous: string | null; at: string };

// The version changes in streamed `Version` readings (oldest first), starting from the version the
// vehicle row holds. A car with no version yet gets only its newest one, like the poll's first sight.
export function versionChanges(readings: Reading[], current: string | null): VersionStep[] {
  const steps: VersionStep[] = [];
  let running = current;
  for (const reading of readings) {
    const version = normaliseVersion(typeof reading.value === "string" ? reading.value : null);
    if (!version || version === running) continue;
    steps.push({ version, previous: running, at: reading.at });
    running = version;
  }
  return current === null ? steps.slice(-1).map((s) => ({ ...s, previous: null })) : steps;
}

// When a version first showed up as the pending update, no later than it was installed.
export function firstOffered(pending: Reading[], version: string, before: string): string | null {
  const limit = Date.parse(before);
  const match = pending.find((r) => typeof r.value === "string" && normaliseVersion(r.value) === version && Date.parse(r.at) <= limit);
  return match?.at ?? null;
}

// The numeric reading closest in time to `at`, if it is within `maxMs`.
export function nearestNumber(readings: Reading[], at: string, maxMs: number): number | null {
  const target = Date.parse(at);
  let best: { gap: number; value: number } | null = null;
  for (const reading of readings) {
    const value = num(reading.value);
    const gap = Math.abs(Date.parse(reading.at) - target);
    if (value !== null && gap <= maxMs && (!best || gap < best.gap)) best = { gap, value };
  }
  return best?.value ?? null;
}
