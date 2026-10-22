import { describe, expect, test } from "bun:test";
import { isStateCode, mostCommonState, siteState, STATES, type StateCode } from "@/lib/india-states";
import type { RolloutChange } from "@/lib/rollout";
import { buildStateRollout, type StateCar } from "@/lib/rollout-states";

const V = "2026.38.5.1";

// `count` cars in `state` on V, each updated to it at `at` plus a day per car.
function group(prefix: string, count: number, state: StateCode | null, at = "2026-10-05T04:00:00Z") {
  const cars: StateCar[] = [];
  const changes: RolloutChange[] = [];
  for (let i = 0; i < count; i++) {
    cars.push({ car: `${prefix}${i}`, version: V, state });
    changes.push({ car: `${prefix}${i}`, version: V, previous: "2026.32.3", at: new Date(Date.parse(at) + i * 86_400_000).toISOString(), source: "tracked" });
  }
  return { cars, changes };
}

function build(...groups: ReturnType<typeof group>[]) {
  const [result] = buildStateRollout(
    groups.flatMap((g) => g.cars),
    groups.flatMap((g) => g.changes),
    [V],
  );
  return result.groups;
}

describe("buildStateRollout", () => {
  test("every state with cars shows its real count and first arrival, most cars first", () => {
    expect(build(group("k", 1, "KA"), group("m", 6, "MH", "2026-10-01T04:00:00Z"), group("t", 2, "TN"))).toEqual([
      { code: "MH", name: "Maharashtra", firstArrived: "2026-10-01T04:00:00.000Z", cars: 6 },
      { code: "TN", name: "Tamil Nadu", firstArrived: "2026-10-05T04:00:00.000Z", cars: 2 },
      { code: "KA", name: "Karnataka", firstArrived: "2026-10-05T04:00:00.000Z", cars: 1 },
    ]);
  });

  test("a car whose state isn't known is on no state", () => {
    expect(build(group("k", 3, "KA"), group("u", 2, null))).toEqual([
      { code: "KA", name: "Karnataka", firstArrived: "2026-10-05T04:00:00.000Z", cars: 3 },
    ]);
  });

  test("a first sighting isn't an arrival; versions not passed in are skipped", () => {
    const seen = group("s", 5, "KA");
    const changes = seen.changes.map((c) => ({ ...c, previous: null }));
    const result = buildStateRollout(seen.cars, changes, [V, "2026.40.2"]);
    expect(result[0].groups).toEqual([{ code: "KA", name: "Karnataka", firstArrived: null, cars: 5 }]);
    expect(result[1]).toEqual({ version: "2026.40.2", groups: [] });
    expect(buildStateRollout(seen.cars, changes, [])).toEqual([]);
  });
});

describe("india-states", () => {
  test("Supercharger city prefixes map to states, aliases included", () => {
    expect(siteState("Bengaluru, Nexus Koramangala")).toBe("KA");
    expect(siteState("Bangalore, Whitefield")).toBe("KA");
    expect(siteState("Gurugram, DLF CyberHub")).toBe("HR");
    expect(siteState("Noida, DLF Mall of India")).toBe("UP");
    expect(siteState("Pune, Phoenix Marketcity")).toBe("MH");
    expect(siteState("Maharashtra")).toBe("MH");
    expect(siteState("Atlantis, Somewhere")).toBeNull();
    expect(siteState(null)).toBeNull();
  });

  test("the most common state wins, the latest on a tie", () => {
    expect(mostCommonState(["KA", "KA", "TN", null, "nope"])).toBe("KA");
    expect(mostCommonState(["KA", "TN"])).toBe("TN");
    expect(mostCommonState([null])).toBeNull();
  });

  test("36 states and union territories", () => {
    expect(Object.keys(STATES)).toHaveLength(36);
    expect(isStateCode("KA")).toBe(true);
    expect(isStateCode("toString")).toBe(false);
  });
});
