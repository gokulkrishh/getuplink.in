import { describe, expect, test } from "bun:test";
import { formatTimeToFull } from "@/lib/format";
import { typicalChargeKw } from "@/lib/telemetry-derive";

// One reading a minute, so each holds for the same time.
const start = Date.parse("2026-10-01T00:00:00Z");
const readings = (values: unknown[]) => values.map((value, i) => ({ at: new Date(start + i * 60_000).toISOString(), value }));

describe("typicalChargeKw", () => {
  test("median of readings above 0.5 kW, skipping ramp-up and closing zeros", () => {
    expect(typicalChargeKw(readings([0, 0.3, 7.1, 7.2, "7.3", 7.2, 0]), start + 7 * 60_000)).toBe(7.2);
  });
  test("null when nothing drew power", () => {
    expect(typicalChargeKw(readings([0, 0.4, 0]), start + 3 * 60_000)).toBeNull();
  });
});

describe("formatTimeToFull", () => {
  test("under a minute left reads Almost full", () => {
    expect(formatTimeToFull(0.5 / 60)).toBe("Almost full");
  });
  test("a minute or more reads Full in", () => {
    expect(formatTimeToFull(1 / 60)).toBe("Full in 1 min");
    expect(formatTimeToFull(1.5)).toBe("Full in 1 h 30 min");
  });
});
