import { describe, expect, test } from "bun:test";
import { weeklyFullRange } from "@/lib/charge-level";
import { energyPoints, levelAt, MIN_POINTS, type Reading, usableKwh, weeklyUsable } from "@/lib/telemetry-derive";

// An instant given as IST wall-clock time.
const at = (local: string) => new Date(`${local}+05:30`).toISOString();
const rows = (pairs: [string, number][]): Reading[] => pairs.map(([t, v]) => ({ at: at(t), value: v }));

// The car's readings on 25 Oct 2026, around the DC charge that ended at 21:55:54 IST at about 70%. From
// 21:25 energy left came at :x0:52 and :x5:52, the level at :x2:59 and :x7:59: never the same instant.
const level25 = rows([
  ["2026-10-25T21:22:59", 46.292],
  ["2026-10-25T21:27:59", 48.172],
  ["2026-10-25T21:32:59", 52.03],
  ["2026-10-25T21:37:59", 56.082],
  ["2026-10-25T21:42:59", 59.908],
  ["2026-10-25T21:47:59", 64.025],
  ["2026-10-25T21:52:59", 67.785],
  ["2026-10-25T21:57:59", 70.184],
  ["2026-10-25T22:02:59", 69.568],
  ["2026-10-25T22:07:59", 69.374],
  ["2026-10-25T22:12:59", 69.309],
  ["2026-10-25T22:17:59", 69.276],
  ["2026-10-25T22:22:59", 69.211],
]);
const energy25 = rows([
  ["2026-10-25T21:25:52", 30.5],
  ["2026-10-25T21:30:52", 32.76],
  ["2026-10-25T21:35:52", 35.12],
  ["2026-10-25T21:40:52", 37.5],
  ["2026-10-25T21:45:52", 39.76],
  ["2026-10-25T21:50:52", 42.0],
  ["2026-10-25T21:55:52", 44.38],
  ["2026-10-25T22:00:52", 44.12],
  ["2026-10-25T22:05:52", 43.88],
  ["2026-10-25T22:24:56", 43.76],
]);

// Readings the car sent together (same timestamp), 21 to 25 Oct 2026, parked and driving.
const together: [string, number, number][] = [
  ["2026-10-21T19:19:35", 39.26, 61.14],
  ["2026-10-22T16:26:00", 38.76, 60.72],
  ["2026-10-23T11:19:00", 37.76, 58.9],
  ["2026-10-23T11:34:00", 36.5, 56.73],
  ["2026-10-23T11:49:00", 34.62, 53.59],
  ["2026-10-23T13:08:00", 33.0, 50.83],
  ["2026-10-24T07:39:00", 32.26, 49.53],
  ["2026-10-25T08:17:00", 31.38, 48.11],
  ["2026-10-25T21:06:32", 30.88, 47.23],
  ["2026-10-25T21:17:59", 30.38, 46.39],
];

const levels = (r: Reading[]) => r.map((x) => ({ ms: Date.parse(x.at), pct: x.value as number }));

describe("levelAt", () => {
  test("a reading at the same instant is used as it is", () => {
    expect(levelAt(levels(level25), Date.parse(at("2026-10-25T21:47:59")))).toBe(64.025);
  });
  test("mid-charge the level isn't known between readings", () => {
    // 2:53 into the 5 minutes from 64.025% to 67.785%, and at the charge's start and end.
    for (const t of ["21:50:52", "21:25:52", "21:55:52"]) expect(levelAt(levels(level25), Date.parse(at(`2026-10-25T${t}`)))).toBeNull();
  });
  test("parked, the line between the readings either side", () => {
    // 22:05:52, between 69.568% and 69.374%.
    expect(levelAt(levels(level25), Date.parse(at("2026-10-25T22:05:52")))!).toBeCloseTo(69.456, 3);
  });
  test("readings far apart that agree mean the level was still", () => {
    const l = levels(rows([["2026-10-21T19:29:35", 61.07], ["2026-10-21T19:53:35", 61.07]]));
    expect(levelAt(l, Date.parse(at("2026-10-21T19:40:00")))).toBe(61.07);
  });
  test("nothing after (or before) the reading leaves it unknown", () => {
    expect(levelAt(levels(level25), Date.parse(at("2026-10-25T22:24:56")))).toBeNull();
    expect(levelAt(levels(level25), Date.parse(at("2026-10-25T21:00:00")))).toBeNull();
  });
});

describe("energyPoints", () => {
  test("pairs energy and level minutes apart once the car is still, as after the 25 Oct charge", () => {
    // Before, every reading after 21:22 IST went unpaired: none shared a timestamp.
    const points = energyPoints(energy25, level25);
    // Only 22:05:52: the charge's readings had a moving level, 22:00:52 sits on a 0.6-point step, and
    // 22:24:56 has no level reading after it yet.
    expect(points.map((p) => p.at)).toEqual([at("2026-10-25T22:05:52")]);
    // On the car's own line, energy = 2.97 + 59.12 × level, within 0.2 kWh.
    expect(Math.abs(points[0].kwh - (2.97 + 59.12 * (points[0].level / 100)))).toBeLessThan(0.2);
  });
  test("skips levels under 20%", () => {
    expect(energyPoints(rows([["2026-10-25T08:00:00", 10]]), rows([["2026-10-25T08:00:00", 15]]))).toEqual([]);
  });
});

describe("usableKwh", () => {
  const points = together.map(([t, kwh, level]) => ({ at: at(t), kwh, level }));
  test("the slope of energy against level: the kWh from 0% to 100%", () => {
    // With the still reading after the 25 Oct charge, 46% to 69%.
    expect(usableKwh([...points, ...energyPoints(energy25, level25)])!).toBeCloseTo(59.1, 0);
  });
  test("energy ÷ level, the old figure, moved with how full the car was", () => {
    const ratio = (p: (typeof points)[number]) => p.kwh / (p.level / 100);
    expect(ratio(points[0])).toBeCloseTo(64.2, 1);
    expect(ratio(points.at(-1)!)).toBeCloseTo(65.5, 1);
  });
  test("levels that span fewer than MIN_SPAN points give nothing", () => {
    // 46% to 61%: 14.75 points.
    expect(usableKwh(points)).toBeNull();
  });
  test("the week of 26 Oct 2026 so far, 13 readings over 11 points, gives nothing yet", () => {
    // The car's values; the level readings after 07:49:58 are placed either side of each energy reading,
    // as they came, but at rounded times.
    const level26 = rows([
      ["2026-10-26T07:09:00", 69.211], ["2026-10-26T07:14:12", 69.114], ["2026-10-26T07:19:12", 68.758], ["2026-10-26T07:19:58", 68.79],
      ["2026-10-26T07:24:58", 67.493], ["2026-10-26T07:29:58", 66.65], ["2026-10-26T07:34:58", 65.905], ["2026-10-26T07:39:58", 64.543],
      ["2026-10-26T07:44:58", 63.279], ["2026-10-26T07:49:58", 62.339], ["2026-10-26T08:00:58", 62.177], ["2026-10-26T08:24:58", 58.319],
      ["2026-10-26T08:29:58", 58.222], ["2026-10-26T08:36:58", 58.06], ["2026-10-26T08:41:58", 58.027],
    ]);
    const energy26 = rows([
      ["2026-10-26T07:09:00", 43.74], ["2026-10-26T07:14:12", 43.76], ["2026-10-26T07:19:12", 43.62], ["2026-10-26T07:19:58", 43.5],
      ["2026-10-26T07:24:58", 42.88], ["2026-10-26T07:29:58", 42.38], ["2026-10-26T07:34:58", 41.88], ["2026-10-26T07:39:58", 41.12],
      ["2026-10-26T07:44:58", 40.38], ["2026-10-26T07:49:58", 39.88], ["2026-10-26T07:58:11", 39.76], ["2026-10-26T08:27:23", 37.38],
      ["2026-10-26T08:38:57", 37.26],
    ]);
    const week = energyPoints(energy26, level26);
    expect(week.length).toBe(13);
    expect(usableKwh(week)).toBeNull();
    expect(weeklyUsable(week)).toEqual([]);
  });
  test("fewer than MIN_POINTS readings give nothing, however far apart", () => {
    const few = [points[0], points.at(-1)!, { at: at("2026-10-25T22:05:52"), kwh: 43.88, level: 69.456 }];
    expect(few.length).toBeLessThan(MIN_POINTS);
    expect(usableKwh(few)).toBeNull();
  });
});

describe("weeklyUsable", () => {
  test("one figure per IST week with enough spread; the week of 19 Oct 2026 has it", () => {
    const points = [...together.map(([t, kwh, level]) => ({ at: at(t), kwh, level })), ...energyPoints(energy25, level25)];
    const weeks = weeklyUsable(points);
    expect(weeks.length).toBe(1);
    expect(weeks[0].weekStart).toBe(Date.parse(at("2026-10-19T00:00:00")));
    expect(weeks[0].kwh).toBeGreaterThan(58.6);
    expect(weeks[0].kwh).toBeLessThan(59.6);
  });
  test("a week the car sat at one level has no figure", () => {
    const points = rows([["2026-10-27T08:00:00", 0], ["2026-10-28T08:00:00", 0]]).map((r, k) => ({ at: r.at, kwh: 41 - k * 0.1, level: 66 - k * 0.2 }));
    expect(weeklyUsable(points)).toEqual([]);
  });
});

describe("weeklyFullRange", () => {
  test("a range reading with no level at its instant takes the level either side", () => {
    // 21 Oct 2026 19:30 IST: RatedRange came without BatteryLevel; the level either side was 61.07%.
    const range = rows([["2026-10-21T19:34:00", 164.5]]);
    const level = rows([["2026-10-21T19:29:35", 61.07], ["2026-10-21T19:53:35", 61.07]]);
    // Kept unrounded; the page shows it in whole km (formatRangeKm).
    const weeks = weeklyFullRange(range, level);
    expect(weeks.map((w) => w.weekStart)).toEqual([Date.parse(at("2026-10-19T00:00:00"))]);
    expect(weeks[0].km).toBeCloseTo((164.5 * 1.609344) / 0.6107, 9);
  });
});
