import { describe, expect, test } from "bun:test";
import { buildRollout, compareVersions, lagDays, MIN_GROUP, type RolloutCar, type RolloutChange } from "@/lib/rollout";

// `count` cars named prefix0.., each updated to `version` from `previous` at `at` plus a day per car.
function fleet(prefix: string, count: number, version: string, at: string, previous: string | null = "2026.20.6") {
  const cars: RolloutCar[] = [];
  const changes: RolloutChange[] = [];
  for (let i = 0; i < count; i++) {
    cars.push({ car: `${prefix}${i}`, version });
    changes.push({ car: `${prefix}${i}`, version, previous, at: new Date(Date.parse(at) + i * 86_400_000).toISOString(), source: "tracked" });
  }
  return { cars, changes };
}

describe("compareVersions", () => {
  test("compares segment by segment as numbers", () => {
    expect(compareVersions("2026.40.2", "2026.38.5.1")).toBeGreaterThan(0);
    expect(compareVersions("2026.8.3", "2026.14.6.6")).toBeLessThan(0);
    expect(compareVersions("2026.38.5", "2026.38.5.1")).toBeLessThan(0);
    expect(compareVersions("2026.32.3", "2026.32.3")).toBe(0);
  });
});

describe("lagDays", () => {
  test("whole IST days from the global release", () => {
    expect(lagDays("2026-10-01T04:00:00Z", "2026-09-20")).toBe(11);
  });
  test("an evening in IST is already the next day", () => {
    expect(lagDays("2026-09-30T20:00:00Z", "2026-09-20")).toBe(11);
  });
  test("never below zero", () => {
    expect(lagDays("2026-09-18T04:00:00Z", "2026-09-20")).toBe(0);
  });
});

describe("buildRollout", () => {
  test("counts cars now, the first Indian car and the lag", () => {
    const a = fleet("a", 6, "2026.38.5.1", "2026-10-05T04:00:00Z");
    const r = buildRollout(a.cars, a.changes, { "2026.38.5.1": "2026-09-21" });
    expect(r.versions).toEqual([
      { version: "2026.38.5.1", shown: true, carsNow: 6, firstInIndia: "2026-10-05T04:00:00.000Z", globalRelease: "2026-09-21", lagDays: 14 },
    ]);
    expect(r.headline).toEqual({ version: "2026.38.5.1", cars: 6, of: 6 });
  });

  test(`hides a version fewer than ${MIN_GROUP} cars report`, () => {
    const few = fleet("b", MIN_GROUP - 1, "2026.40.2", "2026-10-18T04:00:00Z");
    const r = buildRollout(few.cars, few.changes, { "2026.40.2": "2026-10-10" });
    expect(r.versions).toEqual([{ version: "2026.40.2", shown: false }]);
    expect(r.headline).toBeNull();
    expect(r.counted).toBe(0);
  });

  test(`shows it at exactly ${MIN_GROUP} distinct cars, however many rows`, () => {
    const five = fleet("c", MIN_GROUP, "2026.40.2", "2026-10-18T04:00:00Z");
    // A car recorded on it twice (a rollback and back) is still one car.
    const again = { ...five.changes[0], at: "2026-10-21T04:00:00Z" };
    expect(buildRollout(five.cars, five.changes, {}).versions[0].shown).toBe(true);
    const four = fleet("d", MIN_GROUP - 1, "2026.40.2", "2026-10-18T04:00:00Z");
    expect(buildRollout(four.cars, [...four.changes, { ...four.changes[0], at: again.at }], {}).versions[0].shown).toBe(false);
  });

  test("cars on a hidden version are left out of the totals, so subtraction reveals nothing", () => {
    const many = fleet("e", 8, "2026.38.5.1", "2026-10-05T04:00:00Z");
    const few = fleet("f", 2, "2026.40.2", "2026-10-18T04:00:00Z");
    // The two newer cars passed through 2026.38.5.1 first, so that version has 10 reporters but 8 cars now.
    const passed = few.cars.map((c) => ({ car: c.car, version: "2026.38.5.1", previous: "2026.32.3", at: "2026-10-08T04:00:00Z", source: "tracked" }));
    const r = buildRollout([...many.cars, ...few.cars], [...many.changes, ...passed, ...few.changes], {});
    expect(r.counted).toBe(8);
    expect(r.headline).toEqual({ version: "2026.38.5.1", cars: 8, of: 8 });
    const shownSum = r.versions.reduce((sum, v) => sum + (v.shown ? v.carsNow : 0), 0);
    expect(r.headline!.of - shownSum).toBe(0);
    const hidden = r.versions.find((v) => v.version === "2026.40.2")!;
    expect(hidden).toEqual({ version: "2026.40.2", shown: false });
    expect(Object.keys(hidden)).not.toContain("carsNow");
    expect(Object.keys(hidden)).not.toContain("firstInIndia");
  });

  test("a first sighting is not an arrival date; an imported update is", () => {
    const seen = fleet("g", 5, "2026.32.3", "2026-08-01T04:00:00Z", null);
    expect(buildRollout(seen.cars, seen.changes, { "2026.32.3": "2026-07-20" }).versions[0]).toMatchObject({ firstInIndia: null, lagDays: null });
    const imported = seen.changes.map((c, i) => (i === 3 ? { ...c, source: "imported", at: "2026-07-28T04:00:00Z" } : c));
    expect(buildRollout(seen.cars, imported, { "2026.32.3": "2026-07-20" }).versions[0]).toMatchObject({
      firstInIndia: "2026-07-28T04:00:00.000Z",
      lagDays: 8,
    });
  });

  test("an unknown global release leaves the lag unknown", () => {
    const a = fleet("h", 5, "2026.26.6", "2026-07-01T04:00:00Z");
    expect(buildRollout(a.cars, a.changes, {}).versions[0]).toMatchObject({ globalRelease: null, lagDays: null });
  });

  test("build hashes are dropped and versions sort newest first; the headline skips versions no car runs now", () => {
    const old = fleet("i", 5, "2026.32.3 1a2b3c", "2026-08-01T04:00:00Z");
    const moved = old.changes.map((c) => ({ ...c, version: "2026.38.3.1", previous: "2026.32.3", at: "2026-09-10T04:00:00Z" }));
    const cars = old.cars.map((c) => ({ ...c, version: "2026.32.3" }));
    const r = buildRollout(cars, [...old.changes, ...moved], {});
    expect(r.versions.map((v) => v.version)).toEqual(["2026.38.3.1", "2026.32.3"]);
    expect(r.versions[0]).toMatchObject({ shown: true, carsNow: 0 });
    expect(r.headline).toEqual({ version: "2026.32.3", cars: 5, of: 5 });
  });

  test("nothing reported", () => {
    expect(buildRollout([{ car: "x", version: null }], [], {})).toEqual({ versions: [], counted: 0, headline: null });
  });
});
