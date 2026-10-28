import { describe, expect, test } from "bun:test";
import type { ClimateReadings } from "@/lib/drive-climate";
import type { Drive } from "@/lib/drives";
import { climateDay, type DayInputs, dayFigures, installsIn, onePedal, parkedModes, regenDelta, seatCoolingUsed } from "@/lib/owners-day";
import { summarise } from "@/lib/owners";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// Made-up readings on 26 Oct 2026 (IST), times as seconds into a drive from 9:00 AM.
const DAY = istDay(Date.parse("2026-10-26T12:00:00+05:30"));
const NINE = istDayStart(DAY) + 9 * 3_600_000;
const s = (sec: number) => NINE + sec * 1000;
const at = (sec: number) => new Date(s(sec)).toISOString();
const drive = { start: s(0), end: s(600) };
const noClimate: ClimateReadings = { power: [], ac: [], left: [], right: [], inside: [], outside: [] };

describe("the brake pedal holds its last value", () => {
  test("slowing counts as one-pedal only while the pedal's last reading said up", () => {
    // Pressed before the drive began, released at 100 s, pressed again at 300 s.
    const brake = [
      { at: at(-60), value: true },
      { at: at(100), value: false },
      { at: at(300), value: true },
    ];
    const accel = [
      { t: s(50), v: -1.2 }, // pressed (held from before the drive)
      { t: s(150), v: -0.8 }, // up
      { t: s(160), v: -0.3 }, // not slowing enough to count
      { t: s(200), v: 1.5 }, // speeding up
      { t: s(250), v: -0.6 }, // up
      { t: s(350), v: -2.0 }, // pressed
      { t: s(700), v: -1.0 }, // after the drive
    ];
    expect(onePedal(accel, brake, [drive])).toEqual({ slowing: 4, noBrake: 2 });
  });

  test("before the first pedal reading the pedal isn't known, so that slowing counts neither way", () => {
    expect(onePedal([{ t: s(50), v: -1 }, { t: s(150), v: -1 }], [{ at: at(100), value: false }], [drive])).toEqual({ slowing: 1, noBrake: 1 });
  });

  test("the pedal may come as words or a number", () => {
    const words = [{ at: at(0), value: "BrakePedalOff" }];
    const number = [{ at: at(0), value: 1 }];
    expect(onePedal([{ t: s(10), v: -1 }], words, [drive]).noBrake).toBe(1);
    expect(onePedal([{ t: s(10), v: -1 }], number, [drive]).noBrake).toBe(0);
  });
});

describe("the AC holds its last value", () => {
  test("switched on before the drive, it counts from the drive's start", () => {
    const climate = { ...noClimate, power: [{ at: at(-600), value: "HvacPowerStateOn" }], ac: [{ at: at(-600), value: true }], left: [{ at: at(-600), value: 22 }] };
    expect(climateDay(climate, [drive])).toEqual({ acMs: 600_000, knownMs: 600_000, setMs: { "22": 600_000 } });
  });

  test("a set temperature sent while the AC is off doesn't count", () => {
    const climate = {
      ...noClimate,
      power: [
        { at: at(-60), value: "HvacPowerStateOff" },
        { at: at(300), value: "HvacPowerStateOn" },
      ],
      left: [
        { at: at(-60), value: 18 },
        { at: at(300), value: 23.5 },
      ],
    };
    expect(climateDay(climate, [drive])).toEqual({ acMs: 300_000, knownMs: 600_000, setMs: { "24": 300_000 } });
  });

  test("without the AC's state, nothing is counted", () => {
    expect(climateDay({ ...noClimate, left: [{ at: at(0), value: 22 }] }, [drive])).toBeNull();
  });

  test("seat cooling switched on before a drive counts for it; never sent is unknown", () => {
    expect(seatCoolingUsed([{ at: at(-30), value: 2 }], [drive])).toBe(true);
    expect(seatCoolingUsed([{ at: at(-30), value: 0 }], [drive])).toBe(false);
    expect(seatCoolingUsed([], [drive])).toBeNull();
  });
});

describe("regen's share", () => {
  test("the counters' rise over the day, and none when one is missing or went back", () => {
    expect(regenDelta({ gained: 100, used: 1000 }, { gained: 101.5, used: 1010 })).toEqual({ gained: 1.5, used: 10 });
    expect(regenDelta({ gained: 100, used: null }, { gained: 101.5, used: 1010 })).toBeNull();
    expect(regenDelta({ gained: 100, used: 1000 }, { gained: 99, used: 1010 })).toBeNull();
  });

  test("30 days of it make the share regen gave back", () => {
    const inputs: DayInputs = {
      day: DAY,
      drives: [{ start: s(0), end: s(600), km: 6, kwh: 0.9, whPerKm: 150, startLevel: 70, endLevel: 69 } as Drive],
      parked: [],
      times: [],
      sessions: [],
      accel: null,
      brake: null,
      speed: null,
      climate: noClimate,
      seat: null,
      modes: null,
      counters: { start: { gained: 50, used: 800 }, end: { gained: 50.15, used: 801 } },
      installs: [],
      latest: null,
    };
    const day = dayFigures(inputs);
    expect(day.regen).toEqual({ gained: 0.15, used: 1, km: 6 });
    const month = Array.from({ length: 10 }, (_, k) => ({ day: DAY - k, figures: day }));
    expect(summarise(month, { vinHash: "x", owner: 1 }).values.regenShare).toBeCloseTo(15, 5);
    expect(summarise(month.slice(0, 8), { vinHash: "x", owner: 1 }).values.regenShare).toBeNull(); // 48 km
  });
});

describe("modes while parked and installs", () => {
  test("Sentry Mode armed before the day holds through a stop, but only while the car was seen awake", () => {
    const start = istDayStart(DAY);
    // Awake from midnight to 2 AM (a reading every 5 min), then asleep.
    const times = Array.from({ length: 25 }, (_, k) => start + k * 300_000);
    const modes = {
      SentryMode: [{ at: new Date(start - 3_600_000).toISOString(), value: "SentryModeStateArmed" }],
      ClimateKeeperMode: [{ at: new Date(start + 600_000).toISOString(), value: "ClimateKeeperModeStateDog" }, { at: new Date(start + 1_200_000).toISOString(), value: "ClimateKeeperModeStateOff" }],
    };
    const out = parkedModes(DAY, [drive], times, modes);
    expect(out.sentryMs).toBe(2 * 3_600_000);
    expect([out.dogMs, out.keeperMs, out.campMs]).toEqual([600_000, 0, 0]);
  });

  test("an install counts the days from its offer; the first version seen isn't an install", () => {
    const versions = [{ at: at(0), value: "2026.38.5.1 abc" }, { at: new Date(s(0) + 3 * 86_400_000).toISOString(), value: "2026.40.2 def" }];
    const pending = [{ at: new Date(s(0) - 2 * 86_400_000).toISOString(), value: "2026.38.5.1" }];
    expect(installsIn(DAY, versions, pending, "2026.32.3")).toEqual([{ waitDays: 2, hour: 9 }]);
    expect(installsIn(DAY, versions, pending, null)).toEqual([]);
  });
});
