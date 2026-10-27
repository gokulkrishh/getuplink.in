import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { efficiencyBands, places, speedHistogram } from "@/lib/driving-insights";

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
