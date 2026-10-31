import { describe, expect, test } from "bun:test";
import { axisLabels, lineAxis } from "@/lib/axis";

const distinct = (labels: string[]) => new Set(labels).size === labels.length;

describe("y axis labels", () => {
  // Capacity by distance on the demo car read "64.1, 64.1, 64": three ticks over 64.0 to 64.1 kWh, each
  // rounded to one decimal.
  test("a narrow range never repeats a label", () => {
    const axis = lineAxis([64.1, 64.08, 64.03, 64.0]);
    expect(distinct(axis.labels)).toBe(true);
  });

  test("ticks cover the data and sit on round values", () => {
    for (const ys of [[64.0, 64.1], [21.2, 38.7], [3, 6], [0.01, 0.02], [1200, 1260], [64.05, 64.05]]) {
      const axis = lineAxis(ys);
      expect(axis.lo).toBeLessThanOrEqual(Math.min(...ys));
      expect(axis.hi).toBeGreaterThanOrEqual(Math.max(...ys));
      expect(distinct(axis.labels)).toBe(true);
      expect(axis.ticks).toEqual([axis.hi, (axis.hi + axis.lo) / 2, axis.lo].map((v) => Number(v.toFixed(10))));
    }
    expect(lineAxis([21.2, 38.7]).labels).toEqual(["40", "30", "20"]);
  });

  test("a start held at 0 stays at 0", () => {
    const axis = lineAxis([2, 6], { yFrom: 0 });
    expect(axis.lo).toBe(0);
    expect(axis.labels.at(-1)).toBe("0");
  });

  test("bar charts' top, half and zero never repeat", () => {
    // 0.1 a top made "0.1, 0.1, 0": half of it rounded up to the top.
    expect(distinct(axisLabels([0.1, 0.05, 0]))).toBe(true);
    expect(axisLabels([0.1, 0.05, 0])).toEqual(["0.1", "0.05", "0"]);
    // Labels that were already apart keep their one decimal.
    expect(axisLabels([25, 12.5, 0])).toEqual(["25", "12.5", "0"]);
    expect(axisLabels([2500, 1250, 0])).toEqual(["2.5K", "1.3K", "0"]);
    expect(axisLabels([1, 0.5, 0], { compact: false, decimals: 0 })).toEqual(["1", "0.5", "0"]);
  });
});

describe("lineAxis never hangs on float noise", () => {
  test("a spread of a trillionth (two equal cell gaps worked out from floats) reads as flat", () => {
    const axis = lineAxis([99.99999999999965, 100.00000000000053]);
    expect(axis.ticks.every(Number.isFinite)).toBe(true);
    expect(axis.lo).toBeLessThan(100);
    expect(axis.hi).toBeGreaterThan(100);
    expect(new Set(axis.labels).size).toBe(3);
  });
});
