import { describe, expect, test } from "bun:test";
import {
  aggregate,
  bandEnds,
  type CarDay,
  type CarSummary,
  type DayFigures,
  FIGURES_VERSION,
  halfLine,
  highlights,
  type Latest,
  metric,
  type MetricKey,
  METRICS,
  MAX_BINS,
  MIN_BIN_CARS,
  MIN_CARS,
  OTHER,
  place,
  type SpreadMetric,
  type SpreadStat,
  spreadStat,
  statFor,
  summarise,
  type Value,
  youLine,
} from "@/lib/owners";

// Made-up cars: a day's figures with only what each test sets.
function figures(over: Partial<DayFigures> = {}): DayFigures {
  return {
    v: FIGURES_VERSION,
    km: 0,
    drives: [],
    energyKm: 0,
    energyKwh: 0,
    hourKm: { weekday: Array(24).fill(0), weekend: Array(24).fill(0) },
    parkedHours: 0,
    parkedKwh: 0,
    charges: [],
    hard: null,
    onePedal: null,
    regen: null,
    speed: null,
    climate: null,
    seatCooling: null,
    parkedModes: null,
    installs: [],
    latest: null,
    ...over,
  };
}

const LATEST: Latest = {
  model: "Model Y",
  pack: "Standard Range",
  drive: "Rear-wheel drive",
  lfp: true,
  paint: "Pearl White",
  wheels: "19″ Crossflow",
  capacityKwh: 59.5,
  tyreFrontBar: 2.9,
  tyreRearBar: 2.9,
  chargeLimit: 100,
  settings: { PinToDriveEnabled: true, ForwardCollisionWarning: "ForwardCollisionSensitivityAverage" },
};

const days = (n: number, over: Partial<DayFigures> = {}, latest: Latest | null = LATEST): CarDay[] =>
  Array.from({ length: n }, (_, k) => ({ day: 20_000 + k, figures: figures({ ...over, latest: k === n - 1 ? latest : null }) }));

let next = 0;
// One car with `n` days of the same figures.
const car = (n: number, over: Partial<DayFigures> = {}, latest: Partial<Latest> = {}, vinHash = `vin-${next++}`, owner = next): CarSummary =>
  summarise(days(n, over, { ...LATEST, ...latest }), { vinHash, owner });

describe("a car counts for a metric only with enough data", () => {
  test("energy needs 100 km of drives with their energy, km a week 21 days of rows", () => {
    expect(car(30, { energyKm: 3.4, energyKwh: 0.45 }).values.energy).toBeCloseTo(132.35, 1); // 102 km
    expect(car(30, { energyKm: 3.3, energyKwh: 0.45 }).values.energy).toBeNull(); // 99 km
    expect(car(21, { km: 10 }).values.kmWeek).toBe(70);
    expect(car(20, { km: 10 }).values.kmWeek).toBeNull();
  });

  test("one-pedal needs 5 days with the brake kept and 50 km on them; other days don't count toward it", () => {
    const kept = (n: number) => days(n, { onePedal: { slowing: 10, noBrake: 8, km: 12 } });
    const older = days(20, { km: 30 }).map((d) => ({ ...d, day: d.day - 40 }));
    const s = (list: CarDay[]) => summarise(list, { vinHash: "x", owner: 1 }).values.onePedal;
    expect(s(kept(5))).toBe(80);
    expect(s([...kept(4), ...older])).toBeNull(); // plenty of km, but only 4 days where the brake was kept
  });

  test("a figure the car didn't send stays out, not 0", () => {
    const s = car(30, { km: 20 });
    expect(s.values.onePedal).toBeNull();
    expect(s.values.sentryUsed).toBeNull();
    expect(s.values.regenShare).toBeNull();
    expect(s.values.pinToDrive).toBe("on");
    // A value the page doesn't know is left out, never guessed.
    expect(car(30, {}, { settings: { ForwardCollisionWarning: "ForwardCollisionSensitivityUnknown" } }).values.collisionWarning).toBeNull();
    expect(car(30, {}, { settings: { AutomaticEmergencyBrakingOff: true } }).values.emergencyBraking).toBe("off");
  });
});

describe("aggregate", () => {
  test("a figure shows only across at least 5 cars", () => {
    const four = Array.from({ length: MIN_CARS - 1 }, () => car(30, { energyKm: 5, energyKwh: 0.65 }));
    expect(aggregate(four).metrics.energy).toBeUndefined();
    const five = [...four, car(30, { energyKm: 5, energyKwh: 0.7 })];
    expect(statFor(aggregate(five), "energy", "Model Y · Standard Range · Rear-wheel drive")?.cars).toBe(5);
  });

  test("each group needs 5 cars of its own, and a car is never compared with another group's", () => {
    const y = Array.from({ length: 5 }, () => car(30, { energyKm: 5, energyKwh: 0.65 }));
    const two = Array.from({ length: 2 }, () => car(30, { energyKm: 5, energyKwh: 0.8 }, { model: "Model Y L" }));
    const stats = aggregate([...y, ...two]);
    expect(Object.keys(stats.metrics.energy?.groups ?? {})).toEqual(["Model Y · Standard Range · Rear-wheel drive"]);
    expect(statFor(stats, "energy", "Model Y L · Standard Range · Rear-wheel drive")).toBeNull();
    // A group of 2 isn't published, not even its name: here or in What owners drive, where it joins Other.
    expect(JSON.stringify(stats)).not.toContain("Model Y L");
    // Battery groups the same way: 7 LFP cars show, 0 others.
    expect(Object.keys(stats.metrics.chargeLimit?.groups ?? {})).toEqual(["lfp"]);
  });

  test("a figure needs 5 owners too, so one owner's 4 cars can't pick out a fifth owner's", () => {
    const mine = Array.from({ length: 4 }, (_, k) => car(30, { km: 10 }, {}, `fleet-${k}`, 500));
    const stats = aggregate([...mine, car(30, { km: 20 })]);
    expect(stats.cars).toBe(5);
    expect(stats.owners).toBe(2);
    expect(stats.metrics).toEqual({});
    const fiveOwners = aggregate([...mine, ...Array.from({ length: 4 }, () => car(30, { km: 20 }))]);
    expect(fiveOwners.metrics.kmWeek?.all?.cars).toBe(8);
  });

  test("a car two accounts share counts once", () => {
    const shared = Array.from({ length: 2 }, (_, k) => car(30 - k, { km: 10 }, {}, "same-car", 100 + k));
    const others = Array.from({ length: 3 }, () => car(30, { km: 10 }));
    const stats = aggregate([...shared, ...others]);
    expect(stats.cars).toBe(4);
    expect(stats.metrics.kmWeek).toBeUndefined(); // 4 cars, not 5
    expect(aggregate([...shared, ...others, car(30, { km: 10 })]).metrics.kmWeek?.all?.cars).toBe(5);
  });

  test("a colour, model or wheel fewer than 3 cars have joins Other", () => {
    const paints = ["Pearl White", "Pearl White", "Pearl White", "Ultra Red", "Stealth Grey", "Stealth Grey"];
    const stats = aggregate(paints.map((paint) => car(30, {}, { paint })));
    const paint = stats.metrics.paint?.all;
    expect(paint?.kind).toBe("choice");
    if (paint?.kind !== "choice") return;
    expect(paint.options.map((o) => o.key)).toEqual(["Pearl White", OTHER]);
    expect(paint.options.map((o) => o.share)).toEqual([0.5, 0.5]);
    expect(JSON.stringify(stats)).not.toContain("Ultra Red");
    // A setting isn't a car's identity: rare values keep their own row.
    const pins = aggregate([true, true, true, true, false].map((on) => car(30, {}, { settings: { PinToDriveEnabled: on } }))).metrics.pinToDrive?.all;
    expect(pins?.kind === "choice" && pins.options).toEqual([
      { key: "on", share: 0.8 },
      { key: "off", share: 0.2 },
    ]);
  });

  test("the published totals hold no car's own value or key", () => {
    const cars = Array.from({ length: 6 }, (_, k) => car(30, { km: 10 + k, energyKm: 5, energyKwh: 0.6 + k / 100 }));
    const text = JSON.stringify(aggregate(cars));
    expect(text).not.toContain("vin-");
    expect(text).not.toContain("vinHash");
    expect(text).not.toContain("owner\":"); // a count of owners, not who
  });

  test("hours: each car counts equally, whatever it drove", () => {
    const at = (hour: number, km: number) => {
      const weekday = Array(24).fill(0);
      weekday[hour] = km;
      return { km, hourKm: { weekday, weekend: Array(24).fill(0) } };
    };
    const cars = [car(30, at(9, 100)), ...Array.from({ length: 4 }, () => car(30, at(18, 2)))];
    const hours = aggregate(cars).metrics.driveHours?.all;
    expect(hours?.kind === "hours" && [hours.shares[9], hours.shares[18], hours.rush]).toEqual([0.2, 0.8, 1]);
  });
});

describe("the middle half and where a car sits", () => {
  const energy = metric("energy") as SpreadMetric;
  const stat = spreadStat([112, 118, 124, 126, 128, 133, 137, 139, 152], 10);

  test("the middle half widens out to whole bins, so it always holds half the cars", () => {
    expect([stat.low, stat.high]).toEqual([120, 140]);
    expect(halfLine(energy, stat)).toBe("Half of owners use 120 to 140 Wh/km.");
    // 110 held 2 cars and 150 held 1: each folds inward, so no bin holds fewer than 3.
    expect(stat.bins).toEqual([
      { from: null, to: 130, cars: 5 },
      { from: 130, to: null, cars: 4 },
    ]);
  });

  test("lower or higher than most only outside it; the shown value decides, so the lines agree", () => {
    expect(place(115, stat)).toBe("lower");
    expect(place(128, stat)).toBe("middle");
    expect(place(141, stat)).toBe("higher");
    // 119.6 shows as 120, inside "120 to 140": not "lower than most".
    expect(youLine(energy, 119.6, stat)).toBe("You use 120, about the middle.");
    expect(youLine(energy, 114, stat)).toBe("You use 114, lower than most.");
    expect(youLine(energy, 150, stat)).toBe("You use 150, higher than most.");
  });

  test("a wide spread folds its far ends into open bins and widens its bins to fit", () => {
    const wide = spreadStat([...Array.from({ length: 40 }, (_, k) => k * 25), 5000], 25) as SpreadStat;
    expect(wide.bins.length).toBeLessThanOrEqual(MAX_BINS + 1);
    expect(wide.bins[0]).toEqual({ from: null, to: 100, cars: 4 });
    expect([wide.low, wide.high]).toEqual([250, 750]); // the range keeps its own steps
    expect(wide.bins.at(-1)?.to).toBeNull();
    expect(wide.bins.reduce((a, b) => a + b.cars, 0)).toBe(41);
  });

  test("bins and ranges keep their step's decimals", () => {
    const parked = metric("parkedLoss") as SpreadMetric;
    const s = spreadStat([0.21, 0.25, 0.3, 0.41, 0.45, 0.5, 0.61, 0.65, 0.7, 0.81, 0.85, 0.9], 0.2);
    expect(halfLine(parked, s)).toBe("Half of owners' cars lose 0.2 to 0.8 kWh a day while parked.");
    expect(s.bins.map((b) => b.from)).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(bandEnds(parked, s)).toEqual([0.2, 1]);
  });

  test("no bin holds 1 or 2 cars, and the line's ends never come from one car's value", () => {
    const cases: [number[], number][] = [
      [[101, 141, 142, 143, 193], 10], // 5 cars, one far below and one far above
      [[101, 141, 142, 143, 144, 193], 10],
      [[101, 102, 134, 141, 142, 143, 177, 186, 193], 10], // sparse bins inside
      [[112, 118, 124, 126, 128, 133, 137, 139, 152], 10],
      [[...Array.from({ length: 40 }, (_, k) => k * 25 + 3), 5003], 25],
      [[0.21, 0.25, 0.33, 0.41, 0.45, 0.59, 0.61, 1.73], 0.2],
    ];
    for (const [values, step] of cases) {
      const s = spreadStat(values, step);
      const m = { ...energy, step };
      // An empty bin stays: it says no car is there, nothing about any one car.
      expect(s.bins.every((b) => b.cars === 0 || b.cars >= MIN_BIN_CARS)).toBe(true);
      expect(s.bins.reduce((a, b) => a + b.cars, 0)).toBe(values.length);
      s.bins.slice(1).forEach((b, k) => expect(b.from).toBe(s.bins[k].to));
      // The line's ends and the middle half's are whole steps, never a car's own value.
      for (const v of [...bandEnds(m, s), s.low, s.high]) {
        expect(values).not.toContain(v);
        expect(Math.abs(v / step - Math.round(v / step))).toBeLessThan(1e-9);
      }
    }
    // 5 cars where no split leaves 3 on each side: one bin of every car.
    expect(spreadStat([101, 141, 142, 143, 193], 10).bins).toEqual([{ from: null, to: null, cars: 5 }]);
  });
});

describe("picked for you", () => {
  const GROUP = "Model Y · Standard Range · Rear-wheel drive";
  let n = 0;
  // A car with only the values a test sets, in the demo car's group.
  const with_ = (values: Partial<Record<MetricKey, Value>>, segment: string | null = GROUP): CarSummary => ({
    vinHash: `pick-${n++}`,
    owner: n,
    days: 30,
    segment,
    lfp: true,
    values: { ...(Object.fromEntries(METRICS.map((m) => [m.key, null])) as Record<MetricKey, Value | null>), ...values },
  });
  // Ten cars spread evenly over each range, and the owner's own car.
  const others = (ranges: Partial<Record<MetricKey, [number, number]>>, count = 10) =>
    Array.from({ length: count }, (_, k) => with_(Object.fromEntries(Object.entries(ranges).map(([key, [lo, hi]]) => [key, lo + ((hi - lo) * k) / (count - 1)]))));
  const pick = (cars: CarSummary[], you: CarSummary) => highlights(aggregate([...cars, you]), { you, group: you.segment, lfp: you.lfp });

  const RANGES: Partial<Record<MetricKey, [number, number]>> = { energy: [120, 150], parkedLoss: [0.4, 0.8], plugLevel: [30, 50], kmWeek: [100, 300], chargesWeek: [2, 4], acShare: [50, 90] };

  test("the most different comes first, and a figure about the middle isn't picked while 3 others differ", () => {
    const you = with_({ energy: 210, parkedLoss: 0.6, plugLevel: 22, kmWeek: 30, chargesWeek: 3, acShare: 70 });
    const picked = pick(others(RANGES), you);
    // plugLevel and kmWeek are both below every other car, so their order is a tie.
    expect(picked[0].key).toBe("energy");
    expect(picked.map((h) => h.key).sort()).toEqual(["energy", "kmWeek", "plugLevel"]);
    expect(picked.every((h) => !h.middle)).toBe(true);
    expect(picked[0].line).toBe("Your car uses 210 Wh/km, more than most cars like yours. Half use 120 to 150 Wh/km.");
  });

  test("with fewer than 3 that differ, the most useful about-the-middle ones fill in", () => {
    const you = with_({ energy: 210, parkedLoss: 0.6, plugLevel: 40, kmWeek: 200, chargesWeek: 3, acShare: 70 });
    const picked = pick(others(RANGES), you);
    expect(picked.map((h) => h.key)).toEqual(["energy", "parkedLoss", "plugLevel"]);
    expect(picked.slice(1).every((h) => h.middle)).toBe(true);
    expect(picked[1].line).toBe("Your car loses 0.6 kWh a day while parked, about the middle for cars like yours.");
  });

  test("never more than 5, and only one about Sentry Mode", () => {
    const you = with_({ energy: 210, parkedLoss: 3, plugLevel: 10, kmWeek: 900, chargesWeek: 9, acShare: 5, sentryUsed: "on", sentryHours: 20 });
    const cars = others({ ...RANGES, sentryHours: [1, 3] }).map((c, k) => ({ ...c, values: { ...c.values, sentryUsed: k < 7 ? "on" : "off" } }));
    const picked = pick(cars, you);
    expect(picked.length).toBe(5);
    expect(picked.filter((h) => h.key === "sentryUsed" || h.key === "sentryHours").length).toBeLessThanOrEqual(1);
  });

  test("a car far above the middle half's centre reads as about so many times", () => {
    const you = with_({ parkedLoss: 1.8 });
    const [first] = pick(others({ parkedLoss: [0.4, 0.8] }), you);
    expect(first.line).toBe("Your car loses about 3 times the charge of cars like yours while parked, 1.8 kWh a day.");
  });

  test("a figure fewer than 5 cars have is never a highlight, nor is another model group's", () => {
    // 3 other cars and the owner's have km a week: 4, under MIN_CARS.
    const few = others({ kmWeek: [100, 300] }, MIN_CARS - 2);
    const you = with_({ kmWeek: 2000, energy: 300 }, "Model Y L · Long Range · All-wheel drive");
    // Energy: 10 cars of the other group have it, the owner's group only the owner.
    const stats = aggregate([...few, ...others({ energy: [120, 150] }), you]);
    expect(stats.metrics.kmWeek).toBeUndefined();
    expect(highlights(stats, { you, group: you.segment, lfp: true })).toEqual([]);
  });

  test("no highlights before the owner's own days are worked out", () => {
    expect(highlights(aggregate(others(RANGES)), { you: null, group: GROUP, lfp: true })).toEqual([]);
  });

  test("a choice where the owner is in the minority says what most owners do", () => {
    const cars = Array.from({ length: 10 }, (_, k) => with_({ chargeLimit: k < 8 ? "100" : "90" }));
    const [first] = pick(cars, with_({ chargeLimit: "80" }));
    expect(first.line).toBe("You charge to 80%. Most owners with your battery charge to 100%.");
  });
});
