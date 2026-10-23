import { describe, expect, test } from "bun:test";
import { driveStats } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";

const DAY = 86_400_000;
const now = Date.parse("2026-11-20T12:00:00+05:30");
const drive = (km: number, minutes: number, daysAgo: number): Drive => ({
  start: now - daysAgo * DAY,
  end: now - daysAgo * DAY + minutes * 60_000,
  km,
  kwh: null,
  whPerKm: null,
  startLevel: null,
  endLevel: null,
});

describe("driveStats", () => {
  test("counts, median, longest, time and a day's distance since tracking began", () => {
    const stats = driveStats([drive(4, 15, 1), drive(12, 30, 3), drive(30, 45, 5)], now - 90 * DAY, now - 10 * DAY, now)!;
    expect(stats.drives).toBe(3);
    expect(stats.trips).toBe(3);
    expect(stats.km).toBe(46);
    expect(stats.medianKm).toBe(12);
    expect(stats.longestKm).toBe(30);
    expect(stats.hours).toBe(1.5);
    expect(stats.kmPerDay).toBeCloseTo(4.6);
  });
  test("nothing without drives", () => {
    expect(driveStats([], now - 90 * DAY, null, now)).toBe(null);
  });
});

describe("withDriveEfficiency", () => {
  test("fills a period the counter can't price from the drives in it", async () => {
    const { withDriveEfficiency } = await import("@/lib/drive-stats");
    const blank = { km: 46, whPerKm: null, kwh: null, regenKwh: null };
    const period = { current: blank, previous: null, bars: [] };
    const figures = { periods: { day: period, week: period, month: period, year: period, all: period }, since: null, odometerKm: null };
    const drives = [{ ...drive(34, 40, 0), kwh: 6.8 }, { ...drive(4, 5, 0), kwh: 0.9 }, { ...drive(2, 5, 0), kwh: 0.6 }];
    const month = withDriveEfficiency(figures, drives, now).periods.month.current;
    expect(month.whPerKm).toBeCloseTo(207.5);
    expect(month.kwh).toBeCloseTo(8.3);
  });
});
