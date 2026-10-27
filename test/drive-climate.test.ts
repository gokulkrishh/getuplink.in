import { describe, expect, test } from "bun:test";
import { climateLine, climateOf, hasClimate, isOn, onSeries, stepRuns, summariseClimate, tempAxis, valueAt } from "@/lib/drive-climate";

const ist = (clock: string) => Date.parse(`2026-10-26T${clock}+05:30`);
const at = (clock: string, value: unknown) => ({ at: new Date(ist(clock)).toISOString(), value });
const On = "HvacPowerStateOn";
const Off = "HvacPowerStateOff";

// The 26 Oct 7:14 AM drive as the car sent it (rounded), with the readings from just before it.
const real = {
  power: [at("07:09:00", Off), at("07:11:07", Off), at("07:14:12", Off), at("07:15:12", On), at("07:20:58", On), at("07:50:49", Off), at("07:58:56", On), at("08:20:24", Off)],
  ac: [at("07:09:00", false), at("07:14:12", false), at("07:15:12", true), at("07:50:49", false), at("07:58:56", true), at("08:20:23", false)],
  left: [at("07:09:00", 21), at("07:14:12", 21), at("07:17:12", 21.5), at("07:18:12", 24), at("07:33:21", 23.5), at("07:34:21", 23), at("08:15:55", 22.5), at("08:16:55", 21)],
  right: [at("07:09:00", 21), at("07:17:12", 21.5), at("07:18:12", 24)],
  inside: [at("07:09:00", 26), at("07:14:12", 21.9), at("07:19:12", 23.1), at("07:24:58", 23.8), at("07:53:18", 24.8), at("07:58:18", 27.8), at("08:03:18", 23.8), at("08:16:03", 22.8)],
  outside: [at("07:09:00", 26), at("07:14:12", 26), at("07:19:12", 25), at("07:24:58", 24.5), at("07:42:39", 25.5), at("08:18:57", 26.5)],
};
const drive = [{ start: ist("07:14:12"), end: ist("08:19:00") }];

describe("reading the car's on and off", () => {
  test("words and booleans", () => {
    expect([isOn(true), isOn(false), isOn(On), isOn(Off), isOn(5), isOn(null)]).toEqual([true, false, true, false, null, null]);
  });
  test("the AC is on when the climate is on and the AC's switch isn't off", () => {
    const state = onSeries(real.power, real.ac);
    expect(state.map((p) => [p.t, p.v])).toEqual([
      [ist("07:09:00"), 0],
      [ist("07:15:12"), 1],
      [ist("07:50:49"), 0],
      [ist("07:58:56"), 1],
      [ist("08:20:23"), 0],
    ]);
  });
  test("with only one of the two sent, that one decides", () => {
    expect(onSeries([], [at("07:00:00", true), at("07:10:00", false)]).map((p) => p.v)).toEqual([1, 0]);
    expect(onSeries([at("07:00:00", On)], []).map((p) => p.v)).toEqual([1]);
    expect(onSeries([], [])).toEqual([]);
  });
  test("power and the switch changing a second apart make no blip between", () => {
    const state = onSeries([at("07:00:00", Off), at("07:10:01", On)], [at("07:00:00", false), at("07:10:00", true)]);
    expect(state.map((p) => p.v)).toEqual([0, 1]);
    expect(state[1].t).toBe(ist("07:10:00"));
  });
  test("power on with the AC's switch off is not the AC on", () => {
    expect(onSeries([at("07:00:00", On)], [at("07:00:00", false)]).map((p) => p.v)).toEqual([0]);
  });
});

describe("a held reading cut to the drive", () => {
  const changes = [
    { t: 100, v: 21 },
    { t: 300, v: 24 },
    { t: 500, v: 22 },
  ];
  test("starts at the value in force, changes inside, ends at the window's end", () => {
    expect(stepRuns(changes, [{ start: 200, end: 400 }])).toEqual([
      [
        { t: 200, v: 21 },
        { t: 300, v: 24 },
        { t: 400, v: 24 },
      ],
    ]);
  });
  test("a change at the window's start is the value in force", () => {
    expect(stepRuns(changes, [{ start: 300, end: 450 }])[0][0]).toEqual({ t: 300, v: 24 });
  });
  test("with no value yet it starts at the first reading, and a window with none is left out", () => {
    expect(stepRuns(changes, [{ start: 0, end: 150 }])).toEqual([
      [
        { t: 100, v: 21 },
        { t: 150, v: 21 },
      ],
    ]);
    expect(stepRuns(changes, [{ start: 0, end: 50 }])).toEqual([]);
  });
  test("each window is its own run, so a stop between legs is a gap", () => {
    const runs = stepRuns(changes, [
      { start: 150, end: 250 },
      { start: 350, end: 450 },
    ]);
    expect(runs).toHaveLength(2);
    expect(valueAt(runs, 300)).toBeNull();
    expect(valueAt(runs, 200)).toBe(21);
    expect(valueAt(runs, 400)).toBe(24);
  });
});

describe("the real drive's climate", () => {
  const climate = climateOf(real, drive);

  test("AC on and off stretches within the drive", () => {
    expect(climate.on).toEqual([
      { start: ist("07:15:12"), end: ist("07:50:49") },
      { start: ist("07:58:56"), end: ist("08:19:00") },
    ]);
    expect(climate.off).toEqual([
      { start: ist("07:14:12"), end: ist("07:15:12") },
      { start: ist("07:50:49"), end: ist("07:58:56") },
    ]);
  });

  test("the set temperature is drawn only while the AC was on, from the value in force", () => {
    expect(climate.set).toHaveLength(2);
    expect(climate.set[0][0]).toEqual({ t: ist("07:15:12"), v: 21 });
    expect(climate.set[0].map((p) => p.v)).toEqual([21, 21.5, 24, 23.5, 23, 23]);
    // The second stretch starts at the value in force then (23), which holds until 22.5 and 21.
    expect(climate.set[1].map((p) => p.v)).toEqual([23, 22.5, 21, 21]);
    expect(valueAt(climate.set, ist("07:55:00"))).toBeNull();
  });

  test("inside and outside start at the reading in force when the drive began", () => {
    expect(climate.inside[0][0]).toEqual({ t: ist("07:14:12"), v: 21.9 });
    expect(climate.outside[0][0].v).toBe(26);
    expect(valueAt(climate.inside, ist("07:30:00"))).toBe(23.8);
  });

  test("the summary and the chart's sentence", () => {
    const s = summariseClimate(climate);
    expect(s).toMatchObject({ set: { low: 21, high: 24 }, insideStart: 21.9, insideEnd: 22.8, outside: { low: 24.5, high: 26.5 } });
    expect(s.onMs).toBe(ist("07:50:49") - ist("07:15:12") + (ist("08:19:00") - ist("07:58:56")));
    expect(climateLine(s)).toBe("AC on for 56 min, set to 21 to 24 °C. Outside 24.5 to 26.5 °C.");
    expect(hasClimate(climate)).toBe(true);
  });
});

describe("climate edge cases", () => {
  test("AC on the whole drive reads as one stretch", () => {
    const c = climateOf({ power: [at("07:00:00", On)], ac: [], left: [at("07:00:00", 22)], right: [], inside: [at("07:00:00", 27), at("07:20:00", 23)], outside: [at("07:00:00", 26)] }, drive);
    expect(climateLine(summariseClimate(c))).toBe("AC on the whole drive, set to 22 °C. Outside 26 °C.");
  });
  test("AC off all drive: no set line, the inside still drawn", () => {
    const c = climateOf({ power: [at("07:00:00", Off)], ac: [], left: [at("07:00:00", 22)], right: [], inside: [at("07:00:00", 27)], outside: [at("07:00:00", 26)] }, drive);
    expect(c.set).toEqual([]);
    expect(c.off).toHaveLength(1);
    expect(climateLine(summariseClimate(c))).toBe("AC off. Outside 26 °C.");
    expect(hasClimate(c)).toBe(true);
  });
  test("when the car sent no on or off, the set temperature shows throughout and nothing is said about the AC", () => {
    const c = climateOf({ ...real, power: [], ac: [], inside: [] }, drive);
    expect(c.on).toBeNull();
    expect(c.off).toBeNull();
    expect(c.set).toHaveLength(1);
    expect(climateLine(summariseClimate(c))).toBe("Outside 24.5 to 26.5 °C.");
  });
  test("the left zone is used, else the right", () => {
    const c = climateOf({ ...real, left: [], right: [at("07:00:00", 25)] }, drive);
    expect(c.set[0][0].v).toBe(25);
  });
  test("only the outside temperature is no chart", () => {
    const c = climateOf({ power: [], ac: [], left: [], right: [], inside: [], outside: [at("07:00:00", 26)] }, drive);
    expect(hasClimate(c)).toBe(false);
  });
  test("two legs of a trip are two runs", () => {
    const legs = [
      { start: ist("07:14:12"), end: ist("07:30:00") },
      { start: ist("07:40:00"), end: ist("07:55:00") },
    ];
    const c = climateOf(real, legs);
    expect(c.inside).toHaveLength(2);
    expect(valueAt(c.inside, ist("07:35:00"))).toBeNull();
  });
});

describe("the °C axis", () => {
  test("round ticks a whole step apart covering every value, top first", () => {
    expect(tempAxis([21.9, 27.8, 24])).toEqual({ lo: 20, hi: 28, ticks: [28, 26, 24, 22, 20] });
    expect(tempAxis([25, 25])).toEqual({ lo: 25, hi: 26, ticks: [26, 25] });
    expect(tempAxis([22, 34]).ticks.length).toBeLessThanOrEqual(5);
  });
});
