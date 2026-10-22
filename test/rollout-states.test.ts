import { describe, expect, test } from "bun:test";
import { isStateCode, mostCommonState, siteState, STATES, type StateCode } from "@/lib/india-states";
import { buildStateRollout, type StateCar } from "@/lib/rollout-states";

const V = "2026.38.5.1";

// `count` cars in `state` on V.
function group(prefix: string, count: number, state: StateCode | null): StateCar[] {
  return Array.from({ length: count }, (_, i) => ({ car: `${prefix}${i}`, version: V, state }));
}

const build = (...groups: StateCar[][]) => buildStateRollout(groups.flat(), [V])[0].groups;

describe("buildStateRollout", () => {
  test("every state with cars shows its real count, most cars first", () => {
    expect(build(group("k", 1, "KA"), group("m", 6, "MH"), group("t", 2, "TN"))).toEqual([
      { code: "MH", name: "Maharashtra", cars: 6 },
      { code: "TN", name: "Tamil Nadu", cars: 2 },
      { code: "KA", name: "Karnataka", cars: 1 },
    ]);
  });

  test("a car whose state isn't known is on no state", () => {
    expect(build(group("k", 3, "KA"), group("u", 2, null))).toEqual([{ code: "KA", name: "Karnataka", cars: 3 }]);
  });

  test("cars on other versions and versions not passed in are skipped", () => {
    const cars = [...group("k", 2, "KA"), { car: "x", version: "2026.40.2", state: "KA" as StateCode }];
    expect(buildStateRollout(cars, [V, "2026.44.1"])).toEqual([
      { version: V, groups: [{ code: "KA", name: "Karnataka", cars: 2 }] },
      { version: "2026.44.1", groups: [] },
    ]);
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
