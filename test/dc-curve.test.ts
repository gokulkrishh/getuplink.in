import { describe, expect, test } from "bun:test";
import { chargeCurve, fromStart, levelThroughEnd, powerByLevel, powerFigures } from "@/lib/charge-curve";
import type { Reading } from "@/lib/telemetry-derive";

// The real third-party DC charge of 25 Oct 2026 (stream session 1), 9:25 PM to 9:55 PM IST, 46% to 70%.
// Battery level streams every 5 minutes; DC power only when it changes (three changes in 30 minutes).
const START = "2026-10-25T15:55:56Z";
const END = "2026-10-25T16:25:54Z";
const at = (hms: string) => `2026-10-25T${hms}Z`;
const POWER: Reading[] = [
  { at: at("15:55:30"), value: 18.64147958333045 },
  { at: at("15:56:30"), value: 29.340629344185814 },
  { at: at("16:00:42"), value: 29.16959934800863 },
  { at: at("16:25:54"), value: 0 },
];
const LEVEL: Reading[] = [
  { at: at("15:42:59"), value: 46.940593812616186 },
  { at: at("15:47:59"), value: 46.38949568083824 },
  { at: at("15:52:59"), value: 46.29224306934801 },
  { at: at("15:57:59"), value: 48.17246022482573 },
  { at: at("16:02:59"), value: 52.0301471472714 },
  { at: at("16:07:59"), value: 56.08233929269751 },
  { at: at("16:12:59"), value: 59.90760867797977 },
  { at: at("16:17:59"), value: 64.02463589773272 },
  { at: at("16:22:59"), value: 67.78507020868815 },
  { at: at("16:27:59"), value: 70.18396795878043 },
  { at: at("16:32:59"), value: 69.56803475267564 },
];
const START_LEVEL = 46.29;
const END_LEVEL = 70.18;
const end = Date.parse(END);

// As loadChargeSeries reads it for the session page and the chart alike.
const power = fromStart(POWER.filter((r) => Date.parse(r.at) <= end + 60_000), START, false);
const level = fromStart(levelThroughEnd(LEVEL, end), START, true);
const points = powerByLevel({ power, level, start: Date.parse(START), end, startLevel: START_LEVEL, endLevel: END_LEVEL });

describe("powerByLevel on the real 25 Oct DC charge", () => {
  test("covers the charge from about 46% to 70%, not only the first 5% step", () => {
    const xs = points.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThan(46);
    expect(Math.min(...xs)).toBeLessThan(47);
    expect(Math.max(...xs)).toBeGreaterThan(69.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(END_LEVEL);
    // Every 5% step from 45% to 70% has a point.
    expect([...new Set(xs.map((x) => Math.floor(x / 5) * 5))].sort((a, b) => a - b)).toEqual([45, 50, 55, 60, 65]);
  });

  test("each point takes the power in force, carried forward from the last reading", () => {
    for (const p of points) expect([29.340629344185814, 29.16959934800863]).toContain(p.y);
    // The 18.6 kW reading before the session started isn't part of it.
    expect(points.some((p) => p.y < 20)).toBe(false);
    // Past 16:00:42 the 29.17 kW reading holds to the end.
    expect(points.at(-1)!.y).toBe(29.16959934800863);
  });

  test("battery level rises along the charge, between its readings", () => {
    for (let k = 1; k < points.length; k++) expect(points[k].x).toBeGreaterThanOrEqual(points[k - 1].x);
    // The curve passes close by the 16:12:59 level reading (59.9%), from the minute samples either side.
    expect(points.some((p) => Math.abs(p.x - 59.90760867797977) < 0.5)).toBe(true);
  });

  test("draws nothing before the first power reading or past the end", () => {
    const later = powerByLevel({ power: [{ at: at("16:10:00"), value: 29 }], level, start: Date.parse(START), end, startLevel: START_LEVEL, endLevel: END_LEVEL });
    expect(Math.min(...later.map((p) => p.x))).toBeGreaterThan(56);
    const noLevelAfter = powerByLevel({ power, level: level.filter((r) => Date.parse(r.at) <= Date.parse(at("16:07:59"))), start: Date.parse(START), end, startLevel: START_LEVEL, endLevel: null });
    expect(Math.max(...noLevelAfter.map((p) => p.x))).toBeLessThanOrEqual(56.08233929269751);
  });

  test("no power readings, no curve", () => {
    expect(powerByLevel({ power: [], level, start: Date.parse(START), end, startLevel: START_LEVEL, endLevel: END_LEVEL })).toEqual([]);
  });
});

describe("powerFigures", () => {
  test("the chart's average matches the session page's, about 29.2 kW, not 26", () => {
    const { avgKw, peakKw } = powerFigures(power, end, 29.34);
    expect(avgKw).toBeCloseTo(29.19, 1);
    expect(peakKw).toBe(29.34);
    expect(chargeCurve({ power, level, tempMin: [], tempMax: [], end }).avgKw).toBe(avgKw);
  });

  test("without a recorded peak, the highest reading in the session", () => {
    expect(powerFigures(power, end).peakKw).toBe(29.340629344185814);
    expect(chargeCurve({ power, level, tempMin: [], tempMax: [], end }).peakKw).toBe(29.340629344185814);
  });
});

describe("chargeCurve on the session page", () => {
  test("carries power forward between its readings, as the chart does", () => {
    const curve = chargeCurve({ power, level, tempMin: [], tempMax: [], end });
    const at16 = curve.points.find((p) => p.t === Date.parse(at("16:12:59")))!;
    expect(at16.kw).toBe(29.16959934800863);
    expect(at16.level).toBe(59.90760867797977);
  });
});
