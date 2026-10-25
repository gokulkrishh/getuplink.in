import { describe, expect, test } from "bun:test";
import { buildRollout, type RolloutCar, type RolloutChange } from "@/lib/rollout";
import { ADOPTION_SLOTS, buildAdoption, share } from "@/lib/rollout-adoption";

const DAY = 86_400_000;
// 25 Oct 2026, 6 PM IST.
const NOW = Date.parse("2026-10-25T12:30:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const change = (car: string, version: string, previous: string | null, days: number): RolloutChange => ({
  car,
  version,
  previous,
  at: ago(days),
  source: "tracked",
});

describe("buildAdoption", () => {
  test("draws a month of days and half a year of weeks, ending today", () => {
    const day = buildAdoption([], [], NOW, "day");
    const week = buildAdoption([], [], NOW, "week");
    expect(day.slots).toHaveLength(ADOPTION_SLOTS.day);
    expect(week.slots).toHaveLength(ADOPTION_SLOTS.week);
    expect(day.slots.at(-1)!.label).toBe("25 Oct");
    expect(day.slots.at(-2)!.label).toBe("24 Oct");
    expect(week.slots.at(-2)!.label).toBe("18 Oct");
  });

  test("counts a car only from its first recorded row", () => {
    const cars: RolloutCar[] = [{ car: "a", version: "2026.40.2" }];
    const changes = [change("a", "2026.38.5.1", null, 5), change("a", "2026.40.2", "2026.38.5.1", 2)];
    const { slots, versions } = buildAdoption(cars, changes, NOW, "day");
    // Before its first sight five days ago nothing is known, not even the version it came from.
    expect(slots.at(-7)!.of).toBe(0);
    expect(slots.at(-6)!.of).toBe(1);
    expect(versions.map((v) => v.version)).toEqual(["2026.40.2", "2026.38.5.1"]);
    expect(versions[1].on.slice(-6)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(versions[0].on.slice(-6)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  test("the share grows as cars join and update", () => {
    const cars: RolloutCar[] = [
      { car: "a", version: "2026.40.2" },
      { car: "b", version: "2026.38.5.1" },
    ];
    const changes = [change("a", "2026.38.5.1", "2026.32.3", 10), change("b", "2026.38.5.1", "2026.32.3", 8), change("a", "2026.40.2", "2026.38.5.1", 3)];
    const { slots, versions } = buildAdoption(cars, changes, NOW, "day");
    const newest = versions[0];
    const k = slots.length - 1;
    expect(newest.version).toBe("2026.40.2");
    expect(share(newest.on[k], slots[k].of)).toBe(50);
    expect(share(versions[1].on[k - 5], slots[k - 5].of)).toBe(100);
    expect(slots[k - 9].of).toBe(1);
  });

  test("the last slot matches the cars-now totals, even for a car with no history", () => {
    const cars: RolloutCar[] = [
      { car: "a", version: "2026.40.2" },
      { car: "b", version: "2026.40.2 abc123" },
      { car: "c", version: "2026.38.5.1" },
      { car: "d", version: null },
    ];
    const changes = [change("a", "2026.40.2", "2026.38.5.1", 1), change("c", "2026.38.5.1", null, 20)];
    const adoption = buildAdoption(cars, changes, NOW, "week");
    const rollout = buildRollout(cars, changes, {});
    const k = adoption.slots.length - 1;
    expect(adoption.slots[k].of).toBe(rollout.counted);
    for (const v of rollout.versions) {
      expect(adoption.versions.find((s) => s.version === v.version)?.on[k] ?? 0).toBe(v.carsNow);
    }
  });

  test("a week ends on its last day, so a change later that week counts in the next", () => {
    const changes = [change("a", "2026.40.2", null, 8)];
    const { slots, versions } = buildAdoption([], changes, NOW, "week");
    expect(slots.at(-2)!.of).toBe(1);
    expect(slots.at(-3)!.of).toBe(0);
    expect(versions[0].on.at(-1)).toBe(1);
  });

  test("ignores rows from the future and versions it can't read", () => {
    const changes = [change("a", "0.0.0", null, 3), change("b", "2026.40.2", null, -1)];
    const { slots, versions } = buildAdoption([], changes, NOW, "day");
    expect(slots.every((s) => s.of === 0)).toBe(true);
    expect(versions).toEqual([]);
  });
});

describe("share", () => {
  test("whole percent, 0 when nothing is known", () => {
    expect(share(1, 3)).toBe(33);
    expect(share(2, 3)).toBe(67);
    expect(share(0, 0)).toBe(0);
  });
});
