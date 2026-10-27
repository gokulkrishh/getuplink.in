import { describe, expect, test } from "bun:test";
import {
  accelVerdict,
  batteryVerdict,
  driveVerdict,
  gradeVerdict,
  HARD_MS2,
  hardMoments,
  isFlat,
  MIN_USUAL_DRIVES,
  powerVerdict,
  slopes,
  speedVerdict,
  traceEnergy,
  USUAL_DAYS,
  usualHardMoments,
  usualWhPerKm,
} from "@/lib/drive-verdict";
import type { Drive } from "@/lib/drives";

const DAY = 86_400_000;
const now = Date.parse("2026-10-26T12:00:00+05:30");
// 9:59 PM IST on 25 Oct 2026.
const T = Date.parse("2026-10-25T21:59:00+05:30");
const at = (seconds: number, v: number) => ({ t: T + seconds * 1000, v });
const drive = (daysAgo: number, whPerKm: number | null, minutes = 20): Drive => ({
  start: now - daysAgo * DAY,
  end: now - daysAgo * DAY + minutes * 60_000,
  km: 10,
  kwh: whPerKm === null ? null : (whPerKm * 10) / 1000,
  whPerKm,
  startLevel: null,
  endLevel: null,
});

describe("hardMoments", () => {
  test("a run of readings past the threshold is one moment, at its peak", () => {
    const moments = hardMoments([at(0, 0.5), at(1, -3.0), at(2, -3.5), at(3, -3.1), at(4, -0.2), at(30, 3.2), at(31, 3.0)]);
    expect(moments).toEqual([
      { t: T + 2000, v: -3.5, kind: "brake" },
      { t: T + 30_000, v: 3.2, kind: "start" },
    ]);
  });
  test("the threshold is 0.3 g", () => {
    expect(HARD_MS2).toBeCloseTo(2.943);
    expect(hardMoments([at(0, 2.9), at(1, -2.9)])).toEqual([]);
    expect(hardMoments([at(0, 2.95)])).toHaveLength(1);
  });
  test("one brake with a dip under the threshold is one moment", () => {
    expect(hardMoments([at(0, -3.1), at(1, -2.5), at(2, -3.3), at(3, -2.0), at(4, -3.0)])).toHaveLength(1);
    expect(hardMoments([at(0, -3.1), at(6, -3.3)])).toHaveLength(2);
  });
  test("a brake straight after a start is its own moment", () => {
    expect(hardMoments([at(0, 3.1), at(1, -3.1)]).map((m) => m.kind)).toEqual(["start", "brake"]);
  });
});

describe("usual", () => {
  const start = now - DAY / 2;
  test("the median Wh/km of the other drives in the last 30 days, once there are 5", () => {
    const drives = [drive(1, 150), drive(2, 130), drive(3, 140), drive(4, 120), drive(5, 160), drive(6, null), drive(USUAL_DAYS + 1, 500)];
    expect(usualWhPerKm(drives, start, now)).toBe(140);
    expect(usualWhPerKm(drives.slice(0, MIN_USUAL_DRIVES - 1), start, now)).toBe(null);
  });
  test("this drive never counts as its own usual", () => {
    const drives = [drive(1, 150), drive(2, 130), drive(3, 140), drive(4, 120), drive(5, 160)];
    expect(usualWhPerKm(drives, drives[0].start, now)).toBe(null);
  });
  test("hard moments a drive: the median over the other drives since acceleration streamed", () => {
    const drives = [1, 2, 3, 4, 5, 6].map((d) => drive(d, 140));
    // One hard brake in the drive 2 days ago, two in the one 3 days ago, none elsewhere.
    const hard = [{ t: drives[1].start + 60_000, v: -3.2 }, { t: drives[2].start + 60_000, v: -3.2 }, { t: drives[2].start + 120_000, v: 3.5 }];
    expect(usualHardMoments(hard, drives, start, now, drives[5].start)).toBe(0);
    // Acceleration began after the oldest drives: those drives aren't counted as 0s.
    expect(usualHardMoments(hard, drives, start, now, drives[3].start)).toBe(null);
    expect(usualHardMoments(hard, drives, start, now, null)).toBe(null);
  });
});

describe("driveVerdict", () => {
  const brake = { t: T, v: -3.2, kind: "brake" as const };
  const start = { t: T, v: 3.2, kind: "start" as const };
  test("better, close and worse than the usual", () => {
    expect(driveVerdict({ whPerKm: 128, usual: 136, moments: [], usualHard: null }).efficiency).toBe("Efficient: 128 Wh/km, 6% better than your usual 136 Wh/km.");
    expect(driveVerdict({ whPerKm: 134, usual: 136, moments: [], usualHard: null }).efficiency).toBe("Normal: 134 Wh/km, close to your usual 136 Wh/km.");
    expect(driveVerdict({ whPerKm: 150, usual: 136, moments: [], usualHard: null }).efficiency).toBe("Heavy: 150 Wh/km, 10% worse than your usual 136 Wh/km.");
  });
  test("facts only without a usual", () => {
    const v = driveVerdict({ whPerKm: 128, usual: null, moments: [brake, start, start], usualHard: null });
    expect(v.efficiency).toBe("128 Wh/km. Your usual shows after 5 drives.");
    expect(v.smoothness).toBe("1 hard brake and 2 hard starts.");
    expect(driveVerdict({ whPerKm: null, usual: null, moments: [], usualHard: null })).toEqual({ efficiency: null, smoothness: "Smooth: no hard starts or stops." });
  });
  test("smoothness against the usual", () => {
    expect(driveVerdict({ whPerKm: null, usual: null, moments: [brake], usualHard: 4 }).smoothness).toBe("Smooth, with 1 hard brake against your usual 4.");
    expect(driveVerdict({ whPerKm: null, usual: null, moments: [], usualHard: 4 }).smoothness).toBe("Smooth: no hard starts or stops, against your usual 4.");
    expect(driveVerdict({ whPerKm: null, usual: null, moments: [brake, brake, start], usualHard: 2 }).smoothness).toBe("Rougher than usual: 2 hard brakes and 1 hard start against your usual 2.");
  });
  test("nothing to say without acceleration", () => {
    expect(driveVerdict({ whPerKm: null, usual: null, moments: null, usualHard: 4 }).smoothness).toBe(null);
  });
});

describe("chart verdicts", () => {
  test("speed: the top and the middle half", () => {
    const speed = [0, 0, 10, 30, 32, 35, 38, 40, 42, 45, 50, 62].map((v, k) => at(k, v));
    expect(speedVerdict(speed)).toBe("Top 62 km/h, mostly 32 to 45 km/h.");
    expect(speedVerdict([at(0, 20), at(1, 30)])).toBe("Top 30 km/h.");
    expect(speedVerdict([])).toBe(null);
  });
  test("power: energy drawn and won back, each reading held a second", () => {
    const power = [...Array(3600)].map((_, k) => at(k, k % 10 === 0 ? -20 : 10));
    const { drawn, regen } = traceEnergy(power);
    expect(drawn).toBeCloseTo(9.0, 1);
    expect(regen).toBeCloseTo(2.0, 1);
    expect(powerVerdict(power)).toBe("About 9.0 kWh drawn, 2.0 kWh won back by regen (22%).");
  });
  test("power: a gap between readings, or a leg's end, adds nothing", () => {
    expect(traceEnergy([at(0, 36), at(11, 36)]).drawn).toBe(0);
    expect(traceEnergy([at(0, 36), at(10, 36)]).drawn).toBeCloseTo(0.1);
    expect(traceEnergy([at(0, 36), at(10, 36)], [{ start: T, end: T + 5000 }, { start: T + 8000, end: T + 200_000 }]).drawn).toBe(0);
  });
  test("power: a short hop", () => {
    expect(powerVerdict([at(0, 5), at(1, 6)])).toBe("Peak 6.0 kW.");
    expect(powerVerdict([...Array(600)].map((_, k) => at(k, 12)))).toBe("About 2.0 kWh drawn, nothing won back by regen.");
  });
  test("acceleration: the hard moments and when", () => {
    expect(accelVerdict([])).toBe("Gentle: no hard starts or stops.");
    expect(accelVerdict([{ t: T, v: -3.2, kind: "brake" }, { t: T + 240_000, v: -3.0, kind: "brake" }])).toBe("2 hard brakes, at 9:59 PM and 10:03 PM.");
    expect(accelVerdict([{ t: T - 540_000, v: 3.2, kind: "start" }, { t: T, v: -3.2, kind: "brake" }])).toBe("1 hard brake at 9:59 PM and 1 hard start at 9:50 PM.");
    const many = [0, 1, 2, 3, 4].map((k) => ({ t: T + k * 60_000, v: -3.2, kind: "brake" as const }));
    expect(accelVerdict(many)).toBe("5 hard brakes, at 9:59 PM, 10:00 PM and 10:01 PM, and 2 more.");
  });
  test("road grade: flat, mostly flat, climbs and descents", () => {
    expect(isFlat([at(0, 0.5), at(1, -1), at(2, 1)])).toBe(true);
    expect(gradeVerdict([at(0, 0.5), at(1, -1)])).toBe("Flat all the way.");
    expect(gradeVerdict([at(0, 1.5), at(1, -1.2)])).toBe("Mostly flat.");
    // A climb is a stretch at 2% or more for 30 s; a few seconds of 5% is noise.
    expect(gradeVerdict([at(0, 1.5), at(1, 3), at(2, 5.2), at(3, 2), at(4, 0)])).toBe("Mostly flat.");
    const climb = (from: number, seconds: number, v: number) => [...Array(seconds + 1)].map((_, k) => at(from + k, v + (k % 2 ? 0.3 : -0.3)));
    // Two steep stretches 5 s apart are one climb; 80 s apart they are two.
    expect(gradeVerdict([...climb(0, 40, 3), ...climb(45, 40, 5), ...climb(120, 40, -4.4)])).toBe("One climb at 9:59 PM, up to 5%, and one descent at 10:01 PM, down to 5%.");
    expect(gradeVerdict([...climb(0, 40, 3), ...climb(120, 40, 5), ...climb(300, 40, -4.4)])).toBe("2 climbs, the steepest 5% at 10:01 PM, and one descent at 10:04 PM, down to 5%.");
    expect(gradeVerdict([])).toBe(null);
  });
  test("road grade: a short dip doesn't end a climb, the other way does", () => {
    const run = (from: number, seconds: number, v: number) => [...Array(seconds)].map((_, k) => at(from + k, v));
    expect(slopes([...run(0, 20, 4), ...run(20, 10, 1), ...run(30, 20, 4)]).climbs).toHaveLength(1);
    expect(slopes([...run(0, 20, 4), ...run(20, 20, 1), ...run(40, 20, 4)]).climbs).toHaveLength(0);
    expect(slopes([...run(0, 20, 4), ...run(20, 5, -3), ...run(25, 20, 4)]).climbs).toHaveLength(0);
  });
  test("road grade: a noisy flat road reads mostly flat, not dozens of climbs", () => {
    // Ten minutes of ±3% jitter at one reading a second, then one real climb: the noise must count for nothing.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 6 - 3;
    const noise = [...Array(600)].map((_, k) => at(k, rand()));
    expect(gradeVerdict(noise)).toBe("Mostly flat.");
    const real = [...Array(90)].map((_, k) => at(700 + k, 4 + rand() / 3));
    const { climbs, descents } = slopes([...noise, ...real]);
    expect(climbs).toHaveLength(1);
    expect(descents).toHaveLength(0);
    expect(gradeVerdict([...noise, ...real])).toMatch(/^One climb at 10:1[012] PM, up to [45]%\.$/);
  });
  test("battery: used, stayed, charged on the way", () => {
    expect(batteryVerdict(71, 70, 3.7)).toBe("Used 1% over 3.7 km.");
    expect(batteryVerdict(70, 70, 0.8)).toBe("Stayed at 70% over 0.8 km.");
    expect(batteryVerdict(70, 75, 3.7)).toBe("70% to 75% over 3.7 km, charged on the way.");
    expect(batteryVerdict(null, 70, 3.7)).toBe(null);
  });
});
