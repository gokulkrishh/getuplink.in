// Where each version runs in India, state by state, for the map on /rollout. Pure like lib/rollout.ts. Every
// state with cars shows its real count; only totals leave the server, never a car.
import { STATES, type StateCode } from "@/lib/india-states";
import { normaliseVersion } from "@/lib/versions";

// One car with its home state (null when not known yet). `car` is the same opaque key as RolloutCar's.
export type StateCar = { car: string; version: string | null; state: StateCode | null };

export type StateGroup = { code: StateCode; name: string; cars: number };

// One version's states, most cars first. Cars now on the version count, the same cars as RolloutVersion's
// carsNow; a car whose state isn't known yet is in that total but on no state.
export type VersionStates = { version: string; groups: StateGroup[] };

export function buildStateRollout(cars: StateCar[], versions: string[]): VersionStates[] {
  return versions.map((version) => {
    const states = new Map<StateCode, number>();
    for (const car of cars) {
      if (normaliseVersion(car.version) !== version || !car.state) continue;
      states.set(car.state, (states.get(car.state) ?? 0) + 1);
    }
    const groups = [...states].map(([code, cars]) => ({ code, name: STATES[code].name, cars }));
    groups.sort((a, b) => b.cars - a.cars || a.name.localeCompare(b.name));
    return { version, groups };
  });
}
