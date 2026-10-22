// Where each version runs in India, state by state, for the map on /rollout. Pure like lib/rollout.ts. Every
// state with cars shows its real count; only totals leave the server, never a car.
import { STATES, type StateCode } from "@/lib/india-states";
import type { RolloutChange } from "@/lib/rollout";
import { normaliseVersion } from "@/lib/versions";

// One car with its home state (null when not known yet). `car` is the same opaque key as RolloutCar's.
export type StateCar = { car: string; version: string | null; state: StateCode | null };

export type StateGroup = { code: StateCode; name: string; firstArrived: string | null; cars: number };

// One version's states, most cars first. Cars now on the version count, the same cars as RolloutVersion's
// carsNow; a car whose state isn't known yet is in that total but on no state.
export type VersionStates = { version: string; groups: StateGroup[] };

type Pool = { cars: number; first: number };

function add(pools: Map<string, Pool>, key: string, cars: number, first: number) {
  const pool = pools.get(key) ?? { cars: 0, first: Infinity };
  pool.cars += cars;
  pool.first = Math.min(pool.first, first);
  pools.set(key, pool);
}

const day = (first: number) => (Number.isFinite(first) ? new Date(first).toISOString() : null);

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
    const states = new Map<string, Pool>();
    for (const car of cars) {
      if (normaliseVersion(car.version) !== version || !car.state) continue;
      add(states, car.state, 1, arrived.get(car.car)?.get(version) ?? Infinity);
    }
    const groups = [...states].map(([code, pool]) => ({
      code: code as StateCode,
      name: STATES[code as StateCode].name,
      firstArrived: day(pool.first),
      cars: pool.cars,
    }));
    groups.sort((a, b) => b.cars - a.cars || a.name.localeCompare(b.name));
    return { version, groups };
  });
}
