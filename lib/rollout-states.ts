// Where each version runs in India, state by state, for the map on /rollout. Pure like lib/rollout.ts, and
// held to the same privacy rule: no group of fewer than MIN_GROUP cars is ever shown or derivable.
import { type Region, STATES, type StateCode } from "@/lib/india-states";
import { MIN_GROUP, type RolloutChange } from "@/lib/rollout";
import { normaliseVersion } from "@/lib/versions";

// One car with its home state (null when not known yet). `car` is the same opaque key as RolloutCar's.
export type StateCar = { car: string; version: string | null; state: StateCode | null };

export type StateGroup =
  | { kind: "state"; code: StateCode; name: string; firstArrived: string | null; cars: number }
  // States of one region that are each under MIN_GROUP, pooled: "Other South states".
  | { kind: "region"; region: Region; firstArrived: string | null; cars: number };

// One version's groups, most cars first. Cars now on the version count, the same cars as RolloutVersion's
// carsNow, which /rollout already shows; groups never name the states that are left out.
export type VersionStates = { version: string; groups: StateGroup[] };

type Pool = { cars: number; first: number };

function add(pools: Map<string, Pool>, key: string, cars: number, first: number) {
  const pool = pools.get(key) ?? { cars: 0, first: Infinity };
  pool.cars += cars;
  pool.first = Math.min(pool.first, first);
  pools.set(key, pool);
}

const day = (first: number) => (Number.isFinite(first) ? new Date(first).toISOString() : null);

// `versions` are the ones buildRollout shows (MIN_GROUP reporters or more); any other version is skipped.
export function buildStateRollout(cars: StateCar[], changes: RolloutChange[], versions: string[]): VersionStates[] {
  // car -> version -> its first recorded update to it. A first sighting isn't an arrival, as in buildRollout.
  const arrived = new Map<string, Map<string, number>>();
  for (const change of changes) {
    const version = normaliseVersion(change.version);
    const at = Date.parse(change.at);
    if (!version || !Number.isFinite(at)) continue;
    if (change.previous === null && change.source !== "imported") continue;
    const own = arrived.get(change.car) ?? new Map<string, number>();
    if (at < (own.get(version) ?? Infinity)) own.set(version, at);
    arrived.set(change.car, own);
  }

  return versions.map((version) => {
    let total = 0;
    const states = new Map<string, Pool>();
    for (const car of cars) {
      if (normaliseVersion(car.version) !== version) continue;
      total++;
      if (car.state) add(states, car.state, 1, arrived.get(car.car)?.get(version) ?? Infinity);
    }

    const groups: StateGroup[] = [];
    const regions = new Map<string, Pool>();
    for (const [code, pool] of states) {
      const state = STATES[code as StateCode];
      if (pool.cars >= MIN_GROUP) {
        groups.push({ kind: "state", code: code as StateCode, name: state.name, firstArrived: day(pool.first), cars: pool.cars });
      } else {
        add(regions, state.region, pool.cars, pool.first);
      }
    }
    for (const [region, pool] of regions) {
      if (pool.cars >= MIN_GROUP) groups.push({ kind: "region", region: region as Region, firstArrived: day(pool.first), cars: pool.cars });
    }
    groups.sort((a, b) => b.cars - a.cars || (a.kind === b.kind ? 0 : a.kind === "state" ? -1 : 1));

    // The version's total is on the page, so the cars no group shows (states left out, and cars whose state
    // isn't known) are the total minus the groups. Between 1 and MIN_GROUP - 1 that difference would give
    // away a small group; dropping the smallest group makes it MIN_GROUP or more, since every group is.
    const shown = groups.reduce((sum, g) => sum + g.cars, 0);
    if (total - shown > 0 && total - shown < MIN_GROUP) groups.pop();
    return { version, groups };
  });
}
