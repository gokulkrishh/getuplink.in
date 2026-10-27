import { describe, expect, test } from "bun:test";
import { CAR_DATA_GROUPS, groupKeep, keepWords, UNGROUPED } from "@/lib/car-data";
import { ALL_FIELDS } from "@/lib/telemetry-fields.mjs";

describe("Car data we store", () => {
  test("lists every field Uplink asks the car for, once, and nothing else", () => {
    const listed = CAR_DATA_GROUPS.flatMap((g) => g.fields);
    expect(UNGROUPED).toEqual([]);
    expect(listed.filter((f) => !ALL_FIELDS.includes(f))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  test("never lists what isn't collected", () => {
    expect(CAR_DATA_GROUPS.flatMap((g) => g.fields).filter((f) => /^Media/.test(f))).toEqual([]);
  });

  test("keep times read as the page shows them", () => {
    expect(keepWords({ days: [7, 7], forever: false })).toBe("7 days");
    expect(keepWords({ days: [7, 120], forever: true })).toBe("7 to 120 days, some for good");
    expect(keepWords({ days: [], forever: true })).toBe("for good");
    const location = CAR_DATA_GROUPS.find((g) => g.title === "Location and navigation");
    expect(location && keepWords(groupKeep(location))).toBe("7 to 120 days");
  });
});
