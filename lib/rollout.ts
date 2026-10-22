// India rollout tracker: which software versions have reached Indian cars, pooled across every car Uplink
// tracks. Pure (no database), so the real loader (lib/server/rollout.ts) and the demo fleet go through the
// same counting, and the privacy rule below is tested on its own.
import { istDay } from "@/lib/telemetry-derive";
import { normaliseVersion } from "@/lib/versions";

// The owner's privacy rule for the state map: a state's numbers show only once this many cars there run the
// version (lib/rollout-states.ts). Version counts across all of India always show: they name no place.
export const MIN_GROUP = 5;

// When each version was first seen anywhere in the world, as an IST calendar day. Hand-maintained: check a
// new entry against a public community fleet tracker's firmware page (sites that log the first car seen on
// each version worldwide) before adding it. A version missing here shows "lag unknown"; nothing is guessed.
export const GLOBAL_RELEASES: Record<string, string> = {};

// One car as the vehicles table holds it. `car` is an opaque key that never leaves the server.
export type RolloutCar = { car: string; version: string | null };
// One version_history row.
export type RolloutChange = { car: string; version: string; previous: string | null; at: string; source: string };

export type RolloutVersion = {
  version: string;
  carsNow: number;
  // The first time an Indian car was recorded updating to it; null when every row is a first sight.
  firstInIndia: string | null;
  globalRelease: string | null;
  lagDays: number | null;
};

export type Rollout = {
  versions: RolloutVersion[]; // newest first
  // Cars now on any version.
  counted: number;
  // The newest version that cars run now.
  headline: { version: string; cars: number; of: number } | null;
};

// "2026.38.5.1" vs "2026.40.2", segment by segment as numbers. Negative when a is older.
export function compareVersions(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Whole days from the global release to the first Indian car, both as IST days. Never below zero: an Indian
// car can't run a version before the world does, so an earlier date means the release list is a day off.
export function lagDays(firstInIndia: string, globalRelease: string): number {
  const india = istDay(Date.parse(firstInIndia));
  const global = Math.floor(Date.parse(`${globalRelease}T00:00:00Z`) / 86_400_000);
  return Math.max(0, india - global);
}

export function buildRollout(cars: RolloutCar[], changes: RolloutChange[], globalReleases: Record<string, string>): Rollout {
  const reporters = new Map<string, Set<string>>(); // version -> distinct cars that ever ran it
  const first = new Map<string, number>(); // version -> earliest recorded update to it
  const now = new Map<string, number>(); // version -> cars on it now
  const report = (version: string, car: string) => {
    const set = reporters.get(version) ?? new Set<string>();
    set.add(car);
    reporters.set(version, set);
  };

  for (const change of changes) {
    const version = normaliseVersion(change.version);
    if (!version) continue;
    report(version, change.car);
    // A tracked row with no previous version is the first sight of a car already on it when tracking began,
    // not the day it arrived. Imported rows are the owner's own dated updates, so they count.
    if (change.previous === null && change.source !== "imported") continue;
    const at = Date.parse(change.at);
    if (Number.isFinite(at) && at < (first.get(version) ?? Infinity)) first.set(version, at);
  }
  for (const { car, version: raw } of cars) {
    const version = normaliseVersion(raw);
    if (!version) continue;
    report(version, car);
    now.set(version, (now.get(version) ?? 0) + 1);
  }

  const versions: RolloutVersion[] = [...reporters.keys()].sort((a, b) => compareVersions(b, a)).map((version) => {
    const globalRelease = globalReleases[version] ?? null;
    const at = first.get(version);
    const firstInIndia = at === undefined ? null : new Date(at).toISOString();
    return {
      version,
      carsNow: now.get(version) ?? 0,
      firstInIndia,
      globalRelease,
      lagDays: firstInIndia && globalRelease ? lagDays(firstInIndia, globalRelease) : null,
    };
  });

  let counted = 0;
  for (const v of versions) counted += v.carsNow;
  const top = versions.find((v) => v.carsNow > 0);
  const headline = top ? { version: top.version, cars: top.carsNow, of: counted } : null;
  return { versions, counted, headline };
}
