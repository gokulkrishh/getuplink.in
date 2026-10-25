// Adoption over time on /rollout: at the end of each day or week, how many of the cars Uplink knew then ran
// each version. Pure like lib/rollout.ts, fed the same cars and version_history rows.
import { formatShortDate } from "@/lib/format";
import { compareVersions, type RolloutCar, type RolloutChange } from "@/lib/rollout";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { normaliseVersion } from "@/lib/versions";

export type AdoptionGrain = "day" | "week";

// How many bars each grain draws: a month of days, half a year of weeks.
export const ADOPTION_SLOTS: Record<AdoptionGrain, number> = { day: 30, week: 26 };

// One bar. `of` is the cars whose version was known by the slot's end; 0 means nothing is known yet.
export type AdoptionSlot = { key: string; label: string; of: number };

// Cars on one version at the end of each slot, in slot order.
export type AdoptionSeries = { version: string; on: number[] };

export type Adoption = { grain: AdoptionGrain; slots: AdoptionSlot[]; versions: AdoptionSeries[] }; // versions newest first

type Point = { at: number; version: string };

// Each car's known versions, oldest first. A car counts only from its first recorded row: before that its
// version isn't known, so nothing is filled in. Its current version holds at `now`, so the last slot
// matches the cars-now totals.
function timelines(cars: RolloutCar[], changes: RolloutChange[], now: number): Point[][] {
  const byCar = new Map<string, Point[]>();
  const add = (car: string, at: number, raw: string | null) => {
    const version = normaliseVersion(raw);
    if (!version || !Number.isFinite(at) || at > now) return;
    const points = byCar.get(car) ?? [];
    points.push({ at, version });
    byCar.set(car, points);
  };
  for (const change of changes) add(change.car, Date.parse(change.at), change.version);
  for (const car of cars) add(car.car, now, car.version);
  return [...byCar.values()].map((points) => points.sort((a, b) => a.at - b.at));
}

// The version a car ran at `at`, or null before its first row.
function versionAt(points: Point[], at: number): string | null {
  let version: string | null = null;
  for (const p of points) {
    if (p.at > at) break;
    version = p.version;
  }
  return version;
}

export function buildAdoption(cars: RolloutCar[], changes: RolloutChange[], now: number, grain: AdoptionGrain): Adoption {
  const step = grain === "day" ? 1 : 7;
  const count = ADOPTION_SLOTS[grain];
  const today = istDay(now);
  // Each slot ends with the IST day `last` (the newest ends today, read at `now`).
  const ends = Array.from({ length: count }, (_, k) => today - (count - 1 - k) * step);
  const lines = timelines(cars, changes, now);

  const totals = new Map<string, number[]>();
  const slots = ends.map((last, k): AdoptionSlot => {
    const end = Math.min(istDayStart(last + 1) - 1, now);
    let of = 0;
    for (const points of lines) {
      const version = versionAt(points, end);
      if (!version) continue;
      of++;
      const on = totals.get(version) ?? Array<number>(count).fill(0);
      on[k]++;
      totals.set(version, on);
    }
    const label = formatShortDate(istDayStart(last) + 43_200_000);
    return { key: `${grain}-${last}`, label, of };
  });

  const versions = [...totals].map(([version, on]) => ({ version, on })).sort((a, b) => compareVersions(b.version, a.version));
  return { grain, slots, versions };
}

// A whole-number percentage of `of`, 0 when nothing is known.
export function share(on: number, of: number): number {
  return of > 0 ? Math.round((on / of) * 100) : 0;
}
