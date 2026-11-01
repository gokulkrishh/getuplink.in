// Where each version runs in India, state by state, for the India rollout map on /updates. Pure like lib/rollout.ts. Every
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

// Cars per home state across every version, for an owner's AI (get_owner_comparisons). A state with fewer
// than `min` cars joins `otherStates`, so a count never points at a car or two.
export type StateTotals = { states: StateGroup[]; otherStates: number; notKnown: number; total: number };

export function stateTotals(cars: Pick<StateCar, "state">[], min: number): StateTotals {
  const counts = new Map<StateCode, number>();
  let notKnown = 0;
  for (const car of cars) {
    if (!car.state) notKnown++;
    else counts.set(car.state, (counts.get(car.state) ?? 0) + 1);
  }
  const all = [...counts].map(([code, n]) => ({ code, name: STATES[code].name, cars: n }));
  const states = all.filter((s) => s.cars >= min).sort((a, b) => b.cars - a.cars || a.name.localeCompare(b.name));
  const otherStates = all.filter((s) => s.cars < min).reduce((a, s) => a + s.cars, 0);
  return { states, otherStates, notKnown, total: cars.length };
}
