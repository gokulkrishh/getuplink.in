import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { type Band, efficiencyBands, efficiencyGroups, efficiencySummary, type EfficiencyView, places, shownEfficiency, speedHistogram } from "@/lib/driving-insights";
import { periodTimeframe, rangeTimeframe } from "@/lib/periods";

const MIN = 60_000;
const t0 = Date.parse("2026-10-23T10:00:00+05:30");
const drive = (from: number, to: number, km: number, kwh: number | null): Drive => ({ start: t0 + from * MIN, end: t0 + to * MIN, km, kwh, whPerKm: null, startLevel: null, endLevel: null });

describe("speedHistogram", () => {
  test("time-weighted shares inside drives only", () => {
    const speeds = [
      { t: t0, v: 10 },
      { t: t0 + 30_000, v: 50 },
      { t: t0 + 90_000, v: 50 },
      { t: t0 + 20 * MIN, v: 90 }, // parked: left out
    ];
    const bins = speedHistogram(speeds, [drive(0, 2, 1, 0.2)]);
    expect(bins.find((b) => b.from === 0)!.share).toBeCloseTo(30 / 150);
    expect(bins.find((b) => b.from === 40)!.share).toBeCloseTo(120 / 150);
  });
});

describe("efficiencyBands", () => {
  test("km per kWh by outside temperature and by average speed", () => {
    const drives = [drive(0, 60, 40, 8), drive(120, 130, 4, 1)];
    const temps = [
      { t: t0, v: 31 },
      { t: t0 + 120 * MIN, v: 22 },
    ];
    const { byTemp, bySpeed } = efficiencyBands(drives, temps);
    expect(byTemp.map((b) => [b.label, b.kmPerKwh])).toEqual([
      ["20 to 25 °C", 4],
      ["30 to 35 °C", 5],
    ]);
    expect(bySpeed.map((b) => b.label)).toEqual(["20 to 40 km/h", "40 to 60 km/h"]);
  });
});

describe("efficiencyBands by AC setting", () => {
  const r = (min: number, value: unknown) => ({ at: new Date(t0 + min * MIN).toISOString(), value });
  const On = "HvacPowerStateOn";
  const climate = {
    // Off from before the first drive; on from minute 100 to 140 (the second and third drives); off again, so the last drive is off too.
    power: [r(-10, "HvacPowerStateOff"), r(100, On), r(140, "HvacPowerStateOff")],
    ac: [],
    // 22 °C, nudged to 24 °C halfway through the third drive.
    left: [r(-10, 22), r(130, 24)],
    right: [],
    inside: [],
    outside: [],
  };
  const drives = [drive(0, 60, 40, 8), drive(105, 115, 4, 1), drive(120, 140, 8, 2), drive(300, 310, 2, 0.4)];

  test("groups by the set temperature a drive mostly ran at; AC off is its own row; a drive with no climate readings is left out", () => {
    const { byAc } = efficiencyBands(drives, [], climate);
    expect(byAc.map((b) => [b.label, b.drives, b.kmPerKwh])).toEqual([
      ["AC off", 2, 5],
      ["21 to 23 °C", 1, 4],
      ["23 to 25 °C", 1, 4],
    ]);
  });

  test("with no climate readings there is no table", () => {
    expect(efficiencyBands(drives, []).byAc).toEqual([]);
    expect(efficiencyBands(drives, [], { power: [], ac: [], left: [], right: [], inside: [], outside: [] }).byAc).toEqual([]);
  });
});

// A band as efficiencyBands builds it, from its Wh/km: km per kWh is 1000 over it.
const band = (label: string, whPerKm: number, drives = 4): Band => ({ label, drives, km: drives * 20, kmPerKwh: 1000 / whPerKm });
const week = { period: "week" as const, words: "in the last 7 days" };

describe("efficiencySummary", () => {
  test("two groups each under the gap but far apart together give the range, with no 'whatever'", () => {
    const views: EfficiencyView[] = [
      { key: "speed", label: "Speed", bands: [band("40 to 60 km/h", 100), band("60 to 80 km/h", 109)] },
      { key: "outside", label: "Outside", bands: [band("25 to 30 °C", 108), band("30 to 35 °C", 117)] },
    ];
    expect(efficiencySummary(views, week)).toBe("In the last 7 days, your car used 100 to 117 Wh/km.");
  });

  test("bars covering only the period's newest days lead with those days, not the period", () => {
    const close: EfficiencyView[] = [{ key: "ac", label: "AC setting", bands: [band("AC off", 117), band("21 to 23 °C", 120)] }];
    expect(efficiencySummary(close, { period: "year", words: "this year" }, "3 Aug to 31 Oct")).toBe("From 3 Aug to 31 Oct, your car used 117 to 120 Wh/km, whatever the AC setting.");
    expect(efficiencySummary(close, { period: "all", words: "in total" }, "21 Oct")).toBe("On 21 Oct, your car used 117 to 120 Wh/km, whatever the AC setting.");
  });

  // The demo car's week, as the card showed it: every bar within 116 to 120 Wh/km.
  const close: EfficiencyView[] = [
    { key: "speed", label: "Speed", bands: [] },
    { key: "ac", label: "AC setting", bands: [band("AC off", 118, 3), band("21 to 23 °C", 120), band("23 to 25 °C", 117, 6)] },
    { key: "outside", label: "Outside", bands: [band("25 to 30 °C", 119, 10), band("30 to 35 °C", 116, 3)] },
  ];

  test("a small spread gives the range across every bar, and no cause", () => {
    expect(efficiencySummary(close, week)).toBe("In the last 7 days, your car used 116 to 120 Wh/km, whatever the AC setting or outside temperature.");
  });

  test("a setting that costs clearly more is named with both figures", () => {
    const views: EfficiencyView[] = [
      { key: "ac", label: "AC setting", bands: [band("AC off", 118), band("Under 21 °C", 135), band("21 to 23 °C", 121)] },
      { key: "outside", label: "Outside", bands: [band("25 to 30 °C", 119), band("30 to 35 °C", 124)] },
    ];
    expect(efficiencySummary(views, week)).toBe("In the last 7 days, your car used 135 Wh/km with the AC below 21 °C, against 118 Wh/km with it off.");
  });

  test("the group with the widest gap is the one named, in its own words", () => {
    const views: EfficiencyView[] = [
      { key: "speed", label: "Speed", bands: [band("Under 20 km/h", 150), band("60 to 80 km/h", 115)] },
      { key: "ac", label: "AC setting", bands: [band("21 to 23 °C", 118), band("23 to 25 °C", 131)] },
      { key: "outside", label: "Outside", bands: [band("30 to 35 °C", 118), band("35 °C and above", 140)] },
    ];
    expect(efficiencySummary(views, week)).toBe("In the last 7 days, your car used 150 Wh/km below 20 km/h, against 115 Wh/km at 60 to 80 km/h.");
    expect(efficiencySummary(views.slice(1), week)).toBe("In the last 7 days, your car used 140 Wh/km when it was 35 °C or more outside, against 118 Wh/km when it was 30 to 35 °C.");
    expect(efficiencySummary(views.slice(1, 2), week)).toBe("In the last 7 days, your car used 131 Wh/km with the AC at 23 to 25 °C, against 118 Wh/km with it at 21 to 23 °C.");
  });

  test("the boundary: 10% above the lowest, as shown, is named; just under it is not", () => {
    const at = (high: number): EfficiencyView[] => [{ key: "outside", label: "Outside", bands: [band("25 to 30 °C", 110), band("30 to 35 °C", high)] }];
    expect(efficiencySummary(at(121), week)).toBe("In the last 7 days, your car used 121 Wh/km when it was 30 to 35 °C outside, against 110 Wh/km when it was 25 to 30 °C.");
    // 120.6 shows as 121, so it is named too: the sentence goes by the figures on the bars.
    expect(efficiencySummary(at(120.6), week)).toContain("121 Wh/km when it was 30 to 35 °C outside");
    expect(efficiencySummary(at(120.4), week)).toBe("In the last 7 days, your car used 110 to 120 Wh/km, whatever the outside temperature.");
  });

  test("too little data says nothing: bands under 3 drives, a group with one band, or no figure", () => {
    expect(efficiencySummary([], week)).toBeNull();
    expect(efficiencySummary([{ key: "ac", label: "AC setting", bands: [band("AC off", 118), band("21 to 23 °C", 160, 2)] }], week)).toBeNull();
    expect(efficiencySummary([{ key: "outside", label: "Outside", bands: [band("25 to 30 °C", 118)] }], week)).toBeNull();
    expect(efficiencySummary([{ key: "outside", label: "Outside", bands: [band("25 to 30 °C", 118), { label: "30 to 35 °C", drives: 5, km: 10, kmPerKwh: null }] }], week)).toBeNull();
    // The two-drive band is left out of the range as well as the bars.
    expect(efficiencySummary([{ key: "ac", label: "AC setting", bands: [band("AC off", 118), band("21 to 23 °C", 119), band("23 to 25 °C", 190, 2)] }], week)).toBe(
      "In the last 7 days, your car used 118 to 119 Wh/km, whatever the AC setting.",
    );
  });

  test("names the period once, at the head, for every period and a picked range", () => {
    const now = Date.parse("2026-10-31T12:00:00+05:30");
    const lead = (frame: Parameters<typeof efficiencySummary>[1]) => efficiencySummary(close, frame)!.split(", your car")[0];
    expect(lead(periodTimeframe("day", now))).toBe("Today");
    expect(lead(periodTimeframe("week", now))).toBe("In the last 7 days");
    expect(lead(periodTimeframe("month", now))).toBe("This month");
    expect(lead(periodTimeframe("all", now))).toBe("So far");
    const day = 20_000 + 0; // any IST day number works for the words
    expect(lead(rangeTimeframe({ from: day, to: day + 9 }, now))).toMatch(/^From \d+ \w+( \d{4})? to \d+ \w+( \d{4})?$/);
  });

  test("the same bars rounded to one figure read as one figure", () => {
    expect(efficiencySummary([{ key: "outside", label: "Outside", bands: [band("25 to 30 °C", 118.2), band("30 to 35 °C", 117.9)] }], week)).toBe(
      "In the last 7 days, your car used 118 Wh/km, whatever the outside temperature.",
    );
  });
});

describe("shownEfficiency and efficiencyGroups", () => {
  test("keeps groups with two bands of 3 or more drives, and names them in order", () => {
    const shown = shownEfficiency([
      { key: "speed", label: "Speed", bands: [band("Under 20 km/h", 150, 2), band("20 to 40 km/h", 120)] },
      { key: "ac", label: "AC setting", bands: [band("AC off", 118), band("21 to 23 °C", 120)] },
      { key: "outside", label: "Outside", bands: [band("25 to 30 °C", 119), band("30 to 35 °C", 116)] },
    ]);
    expect(shown.map((v) => v.key)).toEqual(["ac", "outside"]);
    expect(efficiencyGroups(shown, "and")).toBe("AC setting and outside temperature");
    expect(efficiencyGroups([{ key: "speed" }, { key: "ac" }, { key: "outside" }], "or")).toBe("speed, AC setting or outside temperature");
    expect(efficiencyGroups([{ key: "ac" }], "and")).toBe("AC setting");
  });
});

describe("places", () => {
  test("joins parking spots within 150 m, with visits, time parked and the car's Home flag", () => {
    const drives = [drive(0, 10, 2, 0.4), drive(70, 80, 2, 0.4), drive(200, 210, 2, 0.4)];
    const locations = [
      { t: t0 + 10 * MIN, lat: 12.9352, lng: 77.6245 },
      { t: t0 + 80 * MIN, lat: 12.9716, lng: 77.5946 },
      { t: t0 + 210 * MIN, lat: 12.9353, lng: 77.6246 }, // the first spot again, a few metres away
    ];
    const home = [{ t: t0 + 10 * MIN, v: 1 }];
    const ps = places(drives, locations, { home, work: [], favorite: [] }, t0 + 300 * MIN);
    expect(ps).toHaveLength(2);
    const first = ps.find((p) => p.tag === "home")!;
    expect(first.visits).toBe(2);
    expect(first.parkedMs).toBe((60 + 90) * MIN);
  });
});
