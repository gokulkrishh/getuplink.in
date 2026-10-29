import { describe, expect, test } from "bun:test";
import { archiveSpan, mergeReadings, packReadings, slimReadings, unpackReadings, withArchivedDrives } from "@/lib/drive-archive";
import type { Drive } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";

const T0 = Date.parse("2026-10-24T02:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
// One reading a second, as the car sends while driving.
const everySecond = (n: number, value: (s: number) => unknown): Reading[] => Array.from({ length: n }, (_, s) => ({ at: at(s), value: value(s) }));

const drive = (start: number, end: number, km = 5): Drive => ({ start, end, km, kwh: 1, whPerKm: 200, startLevel: 60, endLevel: 59 });

describe("slimReadings", () => {
  test("numbers keep each 30 s slot's lowest and highest, so a hard stop survives", () => {
    // Steady 0.1 m/s² with one hard stop of -3.4 at 47 s.
    const accel = everySecond(120, (s) => (s === 47 ? -3.4 : 0.1 + (s % 3) * 0.01));
    const slim = slimReadings(accel);
    expect(slim.length).toBeLessThanOrEqual(8); // 4 slots, at most 2 each
    expect(slim.some((r) => r.value === -3.4 && r.at === at(47))).toBe(true);
    // Every kept reading is one the car sent, oldest first.
    expect(slim.every((r) => accel.some((a) => a.at === r.at && a.value === r.value))).toBe(true);
    expect([...slim].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))).toEqual(slim);
  });

  test("a location keeps the first fix of each slot", () => {
    const route = everySecond(90, (s) => ({ latitude: 12.9 + s / 1e4, longitude: 77.6 }));
    expect(slimReadings(route).map((r) => r.at)).toEqual([at(0), at(30), at(60)]);
  });

  test("true/false keeps every change, not just one a slot", () => {
    const ac = [true, true, false, false, true].map((value, s) => ({ at: at(s), value }));
    expect(slimReadings(ac).map((r) => r.value)).toEqual([true, false, true]);
  });

  test("a drive's readings shrink to about a fifteenth", () => {
    const speed = everySecond(1800, (s) => 40 + 10 * Math.sin(s / 20));
    expect(slimReadings(speed).length).toBeLessThanOrEqual(120);
  });
});

describe("pack and unpack", () => {
  test("round-trips the slimmed readings, kept to the window asked for", () => {
    const packed = packReadings({ VehicleSpeed: everySecond(60, (s) => s), Gear: [] });
    expect(Object.keys(packed)).toEqual(["VehicleSpeed"]);
    const back = unpackReadings(packed, ["VehicleSpeed", "Location"], T0 + 30_000, T0 + 60_000);
    expect(back.Location).toEqual([]);
    expect(back.VehicleSpeed.map((r) => r.value)).toEqual([30, 59]);
  });
});

describe("mergeReadings", () => {
  test("the same reading from the full readings and the archive is kept once, oldest first", () => {
    const full = { BatteryLevel: [{ at: at(10), value: 61 }, { at: at(40), value: 60 }] };
    const archive = { BatteryLevel: [{ at: at(0), value: 62 }, { at: at(40), value: 60 }] };
    expect(mergeReadings(["BatteryLevel", "OutsideTemp"], full, archive)).toEqual({
      BatteryLevel: [{ at: at(0), value: 62 }, { at: at(10), value: 61 }, { at: at(40), value: 60 }],
      OutsideTemp: [],
    });
  });
});

describe("withArchivedDrives", () => {
  const H = 3_600_000;
  const windowFrom = T0;
  test("older trips come from the archive, newer from the window, newest first", () => {
    const merged = withArchivedDrives([drive(T0 + 5 * H, T0 + 6 * H)], [drive(T0 - 10 * H, T0 - 9 * H), drive(T0 + 5 * H, T0 + 6 * H, 99)], windowFrom);
    // The archived copy of a drive inside the window isn't used: the window's own is.
    expect(merged.map((d) => [d.start, d.km])).toEqual([
      [T0 + 5 * H, 5],
      [T0 - 10 * H, 5],
    ]);
  });

  test("a drive under way when the window opens is the archived whole, not the window's fragment", () => {
    const whole = drive(T0 - H / 2, T0 + H / 2, 30);
    const fragment = drive(T0 + 60_000, T0 + H / 2, 12);
    expect(withArchivedDrives([fragment], [whole], windowFrom)).toEqual([whole]);
  });
});

describe("archiveSpan", () => {
  test("half an hour before the drive to ten minutes after, as the trip page reads it", () => {
    expect(archiveSpan({ start: T0, end: T0 + 3_600_000 })).toEqual({ from: T0 - 1_800_000, to: T0 + 4_200_000 });
  });
});
