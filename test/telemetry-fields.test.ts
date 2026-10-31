import { describe, expect, test } from "bun:test";
import { telemetryFields } from "@/lib/telemetry-fields.mjs";

describe("telemetryFields", () => {
  test("the level and range shown while charging come every minute", () => {
    // 31 Oct 2026, 2:12 PM on a 60 kW charger: at 5 min Home read 34% while the car said 38%.
    const fields = telemetryFields();
    expect(fields.BatteryLevel.interval_seconds).toBe(60);
    expect(fields.RatedRange.interval_seconds).toBe(60);
    // A tenth of a point, not a whole one: a whole point left a charge's end level, a short drive's use and
    // the level-to-range pairing up to 1 point out. Parked, the level moves about 0.03 a minute at most
    // (31 Oct 2026), so a parked car still adds few readings.
    expect(fields.BatteryLevel.minimum_delta).toBe(0.1);
    expect(fields.RatedRange.minimum_delta).toBe(0.1);
    // The charge's energy counters already come every minute.
    expect(fields.DCChargingEnergyIn.interval_seconds).toBe(60);
    expect(fields.ACChargingEnergyIn.interval_seconds).toBe(60);
  });
});
