import { describe, expect, test } from "bun:test";
import { thinned } from "@/components/stats/drive-lanes";

describe("a long drive's trace, thinned to the plot", () => {
  // An hour of readings every second: 3,600, for a plot 800 px wide.
  const from = 0;
  const to = 3_600_000;
  const points = Array.from({ length: 3600 }, (_, k) => ({ t: k * 1000, v: k === 1234 ? -15 : Math.sin(k) * 3 }));

  test("draws about one reading per 4 px, keeping each slice's biggest swing", () => {
    const drawn = thinned(points, from, to, 800);
    expect(drawn.length).toBe(200);
    expect(drawn.some((p) => p.t === 1_234_000 && p.v === -15)).toBe(true);
    expect(drawn.every((p, k) => k === 0 || p.t > drawn[k - 1].t)).toBe(true);
  });

  test("a short drive with room for every reading is drawn whole", () => {
    expect(thinned(points.slice(0, 150), from, 150_000, 800)).toHaveLength(150);
  });
});
