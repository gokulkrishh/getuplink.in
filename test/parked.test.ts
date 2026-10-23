import { describe, expect, test } from "bun:test";
import { awakeBetween, type DriveInputs, parkedNow } from "@/lib/drives";

const MIN = 60_000;
const t0 = Date.parse("2026-10-22T18:00:00+05:30");
const at = (minutes: number) => new Date(t0 + minutes * MIN).toISOString();
const empty: DriveInputs = { gear: [], odometer: [], battery: [], energy: [], lifetime: [], range: [], charge: [] };

describe("awakeBetween", () => {
  test("each run of readings counts first to last; the one it parked in from the start", () => {
    const times = [2, 6, 10, 120, 124, 400].map((m) => t0 + m * MIN);
    expect(awakeBetween(times, t0, t0 + 600 * MIN)).toBe(14 * MIN);
  });
  test("no readings while parked means none seen awake", () => {
    expect(awakeBetween([t0 - MIN], t0, t0 + 600 * MIN)).toBe(0);
  });
});

describe("parkedNow", () => {
  const input: DriveInputs = {
    ...empty,
    gear: [
      { at: at(-60), value: "ShiftStateP" },
      { at: at(-30), value: "ShiftStateD" },
      { at: at(0), value: "ShiftStateP" },
    ],
    battery: [
      { at: at(0), value: 62 },
      { at: at(300), value: 61.5 },
      { at: at(720), value: 60.49 },
    ],
    energy: [
      { at: at(0), value: 39.4 },
      { at: at(720), value: 38.62 },
    ],
  };
  test("loss, energy and power since the drive ended", () => {
    const now = parkedNow(input)!;
    expect(now.start).toBe(t0);
    expect(now.hours).toBe(12);
    expect(now.lostPercent).toBeCloseTo(1.51);
    expect(now.kwh).toBeCloseTo(0.78);
    expect(now.watts).toBeCloseTo(65);
    expect(now.fromFirstReading).toBe(false);
  });
  test("without a drive it's parked at least since the first reading", () => {
    const now = parkedNow({ ...input, gear: [] })!;
    expect(now.start).toBe(t0);
    expect(now.fromFirstReading).toBe(true);
  });
  test("none while driving or charging", () => {
    expect(parkedNow({ ...input, gear: [...input.gear, { at: at(800), value: "ShiftStateD" }] })).toBe(null);
    expect(parkedNow({ ...input, charge: [{ at: at(700), value: "DetailedChargeStateCharging" }] })).toBe(null);
  });
  test("a charge after the drive restarts the count", () => {
    const charged = parkedNow({
      ...input,
      charge: [
        { at: at(100), value: "DetailedChargeStateCharging" },
        { at: at(200), value: "DetailedChargeStateComplete" },
      ],
    })!;
    expect(charged.start).toBe(t0 + 200 * MIN);
  });
});
