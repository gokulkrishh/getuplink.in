import { describe, expect, test } from "bun:test";
import { latestByField } from "@/lib/telemetry";

// counter_values_at read at one boundary: per field, the boundary's row and the first-ever row (null `at`).
describe("latestByField", () => {
  test("keeps the boundary's row, not the first reading", () => {
    const stream = latestByField([
      { field: "BatteryLevel", at: "infinity", value: 81, created_at: "2026-10-25T08:00:00Z" },
      { field: "BatteryLevel", at: null, value: 40, created_at: "2026-08-01T08:00:00Z" },
    ]);
    expect(stream).toEqual({ BatteryLevel: { at: "2026-10-25T08:00:00Z", value: 81 } });
  });
  test("leaves out a field with no reading before the boundary", () => {
    const stream = latestByField([
      { field: "SoftwareUpdateVersion", at: "infinity", value: null, created_at: null },
      { field: "SoftwareUpdateVersion", at: null, value: null, created_at: null },
      { field: "RatedRange", at: "2026-10-01T00:00:00+00:00", value: { doubleValue: 210 }, created_at: "2026-09-30T23:00:00Z" },
    ]);
    expect(stream).toEqual({ RatedRange: { at: "2026-09-30T23:00:00Z", value: { doubleValue: 210 } } });
  });
  test("a value that is JSON null still counts as a reading", () => {
    expect(latestByField([{ field: "DetailedChargeState", at: "infinity", value: null, created_at: "2026-10-25T08:00:00Z" }])).toEqual({
      DetailedChargeState: { at: "2026-10-25T08:00:00Z", value: null },
    });
  });
});
