import type { ArrivingRow, VersionRow } from "@/components/rollout-lists";
import { formatShortDate } from "@/lib/format";
import type { ReleaseNotesByVersion } from "@/lib/release-notes";
import type { RolloutVersion } from "@/lib/rollout";
import type { Arriving } from "@/lib/rollout-arriving";

export const cars = (n: number) => `${n} ${n === 1 ? "car" : "cars"}`;
// A release list date is an IST calendar day; noon IST keeps it on that day.
const releaseDay = (day: string) => formatShortDate(`${day}T12:00:00+05:30`);

function lagWords(days: number): string {
  if (days === 0) return "Same day as the world";
  return `${days} ${days === 1 ? "day" : "days"} behind`;
}

// The versions on offer as rows for the browser (see ArrivingRows), numbered from 1.
export function arrivingRows(arriving: Arriving[], notes: ReleaseNotesByVersion): ArrivingRow[] {
  return arriving.map((a, k) => ({ version: a.version, n: k + 1, offered: `Offered to ${cars(a.offered)} · on ${a.on}`, notes: notes[a.version] ?? null }));
}

// Every version as rows for the browser (see VersionRows), numbered from 1. `counted`: every car counted.
export function versionRows(versions: RolloutVersion[], counted: number, notes: ReleaseNotesByVersion): VersionRow[] {
  return versions.map((v, k) => ({
    version: v.version,
    n: k + 1,
    cars: cars(v.carsNow),
    gone: v.carsNow === 0,
    share: v.carsNow > 0 ? { on: v.carsNow, of: counted } : null,
    // Only what's known: a car already on the version when tracking began has no arrival date.
    facts: {
      first: v.firstInIndia && `First in India ${formatShortDate(v.firstInIndia)}`,
      global: v.globalRelease && `Global ${releaseDay(v.globalRelease)}`,
      lag: v.lagDays !== null ? lagWords(v.lagDays) : null,
    },
    notes: notes[v.version] ?? null,
  }));
}
