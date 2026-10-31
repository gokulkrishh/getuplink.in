// The short India rollout lines on Software (/updates): where the owner's version stands among Indian cars. Pure, like
// lib/rollout.ts, so it is tested on its own. The glance holds totals only; no car key leaves the server.
import { buildRollout, compareVersions, type RolloutCar } from "@/lib/rollout";
import { buildArriving, type OfferedCar } from "@/lib/rollout-arriving";
import { cars } from "@/lib/rollout-rows";
import { normaliseVersion } from "@/lib/versions";

export type RolloutGlance = {
  // Every car counted, and how many run each version now.
  counted: number;
  running: { version: string; cars: number }[];
  // Versions on offer to cars but not installed yet, newest first.
  arriving: string[];
};

export function rolloutGlance(fleet: RolloutCar[], offers: OfferedCar[]): RolloutGlance {
  const { versions, counted } = buildRollout(fleet, [], {});
  return {
    counted,
    running: versions.flatMap((v) => (v.carsNow > 0 ? [{ version: v.version, cars: v.carsNow }] : [])),
    arriving: buildArriving(offers).map((a) => a.version),
  };
}

// The lines under the Software card, each only when known: how many cars run this version, then either the
// newest version Indian cars run, when it is newer than this one, or else a newer version arriving now
// (offered to cars, not installed yet). The same two terms as the India rollout below them: "Newest in
// India" for installed, "Arriving now" for offered. A newer version the car already has waiting is left to
// the Update block.
export function rolloutLines(version: string | null, pending: string | null, glance: RolloutGlance | null): string[] {
  const own = normaliseVersion(version);
  if (!glance || !own) return [];
  const lines: string[] = [];
  const row = glance.running.find((v) => v.version === own);
  if (row) lines.push(`On ${row.cars} of ${cars(glance.counted)} in India`);
  const newest = glance.running.reduce<{ version: string; cars: number } | null>((a, v) => (!a || compareVersions(v.version, a.version) > 0 ? v : a), null);
  const waiting = normaliseVersion(pending);
  if (newest && newest.version !== waiting && compareVersions(newest.version, own) > 0) {
    lines.push(newestWords(newest.version, newest.cars));
    return lines;
  }
  const arriving = glance.arriving.find((v) => v !== waiting && compareVersions(v, own) > 0);
  if (arriving) lines.push(`Arriving now: ${arriving}`);
  return lines;
}

// The newest version Indian cars run, in the words Updates and the India rollout share.
export function newestWords(version: string, n: number): string {
  return `Newest in India: ${version}, on ${cars(n)}`;
}
