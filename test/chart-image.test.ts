import { describe, expect, test } from "bun:test";
import { chartFileName } from "@/lib/chart-image";

describe("a downloaded chart's file name", () => {
  // 31 Oct 2026, 8:00 PM UTC is already 1 Nov in India.
  const late = new Date("2026-10-31T20:00:00Z");

  test("names the chart and the day it was saved, in India time", () => {
    expect(chartFileName("Time at each speed", late)).toBe("uplink-time-at-each-speed-2026-11-01.png");
  });

  test("keeps only plain letters and digits, so every phone can save it", () => {
    expect(chartFileName("DC charging speed (kW)", late)).toBe("uplink-dc-charging-speed-kw-2026-11-01.png");
    expect(chartFileName("Spend · ₹ / month", late)).toBe("uplink-spend-month-2026-11-01.png");
  });

  test("a chart with no title is still named", () => {
    expect(chartFileName(undefined, late)).toBe("uplink-chart-2026-11-01.png");
    expect(chartFileName("₹", late)).toBe("uplink-chart-2026-11-01.png");
  });
});
