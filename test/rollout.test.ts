import { describe, expect, test } from "bun:test";
import { buildRollout, compareVersions, lagDays, type RolloutCar, type RolloutChange } from "@/lib/rollout";

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
      { version: "2026.38.5.1", carsNow: 6, firstInIndia: "2026-10-05T04:00:00.000Z", globalRelease: "2026-09-21", lagDays: 14 },
    ]);
    expect(r.headline).toEqual({ version: "2026.38.5.1", cars: 6, of: 6 });
  });

  test("every version shows its real count, however few cars report it", () => {
    const one = fleet("b", 1, "2026.40.2", "2026-10-18T04:00:00Z");
    const r = buildRollout(one.cars, one.changes, { "2026.40.2": "2026-10-10" });
    expect(r.versions).toEqual([
      { version: "2026.40.2", carsNow: 1, firstInIndia: "2026-10-18T04:00:00.000Z", globalRelease: "2026-10-10", lagDays: 8 },
    ]);
    expect(r.headline).toEqual({ version: "2026.40.2", cars: 1, of: 1 });
  });

  test("a car recorded on a version twice counts once", () => {
    const five = fleet("c", 5, "2026.40.2", "2026-10-18T04:00:00Z");
    const again = { ...five.changes[0], at: "2026-10-21T04:00:00Z" };
    const r = buildRollout(five.cars, [...five.changes, again], {});
    expect(r.versions[0].carsNow).toBe(5);
    expect(r.counted).toBe(5);
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
    expect(r.versions[0]).toMatchObject({ carsNow: 0 });
    expect(r.headline).toEqual({ version: "2026.32.3", cars: 5, of: 5 });
  });

  test("nothing reported", () => {
    expect(buildRollout([{ car: "x", version: null }], [], {})).toEqual({ versions: [], counted: 0, headline: null });
  });
});
