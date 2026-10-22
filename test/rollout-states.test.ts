import { describe, expect, test } from "bun:test";
import { isStateCode, mostCommonState, siteState, STATES, type StateCode } from "@/lib/india-states";
import { MIN_GROUP, type RolloutChange } from "@/lib/rollout";
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
  test(`a state shows at ${MIN_GROUP} cars, with its first arrival`, () => {
    expect(build(group("k", MIN_GROUP, "KA"), group("m", 6, "MH", "2026-10-01T04:00:00Z"))).toEqual([
      { kind: "state", code: "MH", name: "Maharashtra", firstArrived: "2026-10-01T04:00:00.000Z", cars: 6 },
      { kind: "state", code: "KA", name: "Karnataka", firstArrived: "2026-10-05T04:00:00.000Z", cars: 5 },
    ]);
  });

  test("small states pool into their region, which leaves out the region's shown states", () => {
    const groups = build(group("k", 6, "KA"), group("t", 3, "TN", "2026-10-02T04:00:00Z"), group("l", 2, "KL"));
    expect(groups).toEqual([
      { kind: "state", code: "KA", name: "Karnataka", firstArrived: "2026-10-05T04:00:00.000Z", cars: 6 },
      { kind: "region", region: "South", firstArrived: "2026-10-02T04:00:00.000Z", cars: 5 },
    ]);
    expect(JSON.stringify(groups)).not.toContain("TN");
    expect(JSON.stringify(groups)).not.toContain("Tamil Nadu");
  });

  test("a small state in a small region is left out, and never named", () => {
    const groups = build(group("k", 6, "KA"), group("m", 5, "MH"), group("h", 3, "HR"), group("u", 2, null));
    expect(groups.map((g) => (g.kind === "state" ? g.code : g.region))).toEqual(["KA", "MH"]);
    expect(JSON.stringify(groups)).not.toMatch(/HR|Haryana|North/);
  });

  test("the cars no group shows are never 1 to 4, so subtracting from the version's total reveals nothing", () => {
    // 6 + 5 shown of 13: the other two (one Haryana car, one unknown) would be readable as 13 - 11.
    const groups = build(group("k", 6, "KA"), group("m", 5, "MH"), group("h", 1, "HR"), group("u", 1, null));
    expect(groups.map((g) => (g.kind === "state" ? g.code : g.region))).toEqual(["KA"]);
    expect(13 - groups.reduce((sum, g) => sum + g.cars, 0)).toBe(7);
  });

  test("on a tie the region roll-up is dropped before a state", () => {
    const groups = build(group("k", 5, "KA"), group("t", 3, "TN"), group("l", 2, "KL"), group("h", 1, "HR"));
    expect(groups).toMatchObject([{ kind: "state", code: "KA" }]);
  });

  test("invariants hold on random fleets", () => {
    const codes = ["KA", "TN", "KL", "MH", "GJ", "DL", "HR", "WB", null] as const;
    let seed = 7;
    const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let run = 0; run < 500; run++) {
      const groups = codes.map((code, i) => group(`r${i}-`, Math.floor(rand() * 9), code));
      const total = groups.reduce((sum, g) => sum + g.cars.length, 0);
      const shown = build(...groups);
      const left = total - shown.reduce((sum, g) => sum + g.cars, 0);
      expect(left === 0 || left >= MIN_GROUP).toBe(true);
      for (const g of shown) expect(g.cars).toBeGreaterThanOrEqual(MIN_GROUP);
      for (const g of shown) {
        if (g.kind !== "state") continue;
        expect(groups[codes.indexOf(g.code as (typeof codes)[number])].cars.length).toBe(g.cars);
      }
    }
  });

  test("a first sighting isn't an arrival; versions not passed in are skipped", () => {
    const seen = group("s", 5, "KA");
    const changes = seen.changes.map((c) => ({ ...c, previous: null }));
    const result = buildStateRollout(seen.cars, changes, [V, "2026.40.2"]);
    expect(result[0].groups).toEqual([{ kind: "state", code: "KA", name: "Karnataka", firstArrived: null, cars: 5 }]);
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
