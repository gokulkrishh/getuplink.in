import { describe, expect, test } from "bun:test";
import { rolloutGlance, rolloutLines } from "@/lib/rollout-line";
import type { OfferedCar } from "@/lib/rollout-arriving";
import type { RolloutCar } from "@/lib/rollout";

// 40 cars: 3 on 2026.38.3.2, 36 on 2026.32.9, 1 on 2026.40.2. Two of the older cars have 2026.40.2 on offer.
const cars: RolloutCar[] = [
  ...Array.from({ length: 3 }, (_, i) => ({ car: `a${i}`, version: "2026.38.3.2" })),
  ...Array.from({ length: 36 }, (_, i) => ({ car: `b${i}`, version: "2026.32.9" })),
  { car: "c0", version: "2026.40.2" },
];
const offers: OfferedCar[] = [
  ...cars.map((c) => ({ car: c.car, version: c.version, status: null, offered: null })),
].map((o) => (o.car === "b0" || o.car === "b1" ? { ...o, status: "available", offered: "2026.40.2" } : o));

describe("rolloutLines", () => {
  const glance = rolloutGlance(cars, offers);

  test("says how many of the counted cars run the owner's version", () => {
    expect(rolloutLines("2026.38.3.2", null, glance)).toEqual(["On 3 of 40 cars in India", "2026.40.2 is reaching cars in India"]);
  });

  test("a newer version on offer is named once, and not when it is the owner's own pending update", () => {
    expect(rolloutLines("2026.38.3.2", "2026.40.2", glance)).toEqual(["On 3 of 40 cars in India"]);
  });

  test("the newest version has no newer one reaching cars", () => {
    expect(rolloutLines("2026.40.2", null, glance)).toEqual(["On 1 of 40 cars in India"]);
  });

  test("a version no car runs shows no number", () => {
    expect(rolloutLines("2026.10.1", null, glance)).toEqual(["2026.40.2 is reaching cars in India"]);
    expect(rolloutLines(null, null, glance)).toEqual([]);
  });

  test("with no rollout data, no lines", () => {
    expect(rolloutLines("2026.38.3.2", null, null)).toEqual([]);
  });

  test("one car reads as 1 car", () => {
    const one = rolloutGlance([{ car: "x", version: "2026.38.3.2" }], []);
    expect(rolloutLines("2026.38.3.2", null, one)).toEqual(["On 1 of 1 car in India"]);
  });
});
