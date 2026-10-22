import { describe, expect, test } from "bun:test";
import { sparkBars, sparkLine } from "@/lib/sparkline";

describe("sparkBars", () => {
  test("scales to the largest value from a zero baseline", () => {
    expect(sparkBars([10, 5, 0], 24)).toEqual([
      { k: 0, x: 2, y: 0, width: 6, height: 24 },
      { k: 1, x: 12, y: 12, width: 6, height: 12 },
    ]);
  });
  test("a small value still shows", () => {
    expect(sparkBars([1000, 1], 24)[1].height).toBe(1.5);
  });
  test("nothing when every slot is zero or empty", () => {
    expect(sparkBars([0, null, 0], 24)).toEqual([]);
  });
  test("null slots are left out", () => {
    expect(sparkBars([null, 4, null], 24).map((b) => b.k)).toEqual([1]);
  });
});

describe("sparkLine", () => {
  test("runs between the smallest and largest value, padded", () => {
    expect(sparkLine([150, 170, 160], 24, 2)).toBe("M5 22L15 2L25 12");
  });
  test("a flat series sits in the middle", () => {
    expect(sparkLine([150, 150], 24)).toBe("M5 12L15 12");
  });
  test("a null slot breaks the line, and a lone value is a short tick", () => {
    expect(sparkLine([150, null, 170, 160], 24, 2)).toBe("M3 22h4M25 2L35 12");
  });
  test("empty with nothing to draw", () => {
    expect(sparkLine([null, null], 24)).toBe("");
  });
});
