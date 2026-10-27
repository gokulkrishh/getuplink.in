import { describe, expect, test } from "bun:test";
import { checkTips, tipProblem } from "@/lib/ai-tips";
import type { ClimateSummary } from "@/lib/drive-climate";
import { type DriveTipsInput, driveFindings, timeAbove } from "@/lib/drive-tips";
import { HARD_MS2 } from "@/lib/drive-verdict";

const t0 = Date.parse("2026-10-26T07:14:00+05:30");
const secs = (n: number, v: (k: number) => number) => Array.from({ length: n }, (_, k) => ({ t: t0 + k * 1000, v: v(k) }));

const input: DriveTipsInput = {
  km: 30,
  kwh: 5.04,
  usual: { whPerKm: 131, hard: 1 },
  moments: [
    { t: t0 + 60_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 120_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 180_000, v: -HARD_MS2 - 1, kind: "brake" },
    { t: t0 + 240_000, v: HARD_MS2 + 1, kind: "start" },
  ],
  // 20 kW for 30 minutes, then 10 minutes of -6 kW regen.
  power: secs(2400, (k) => (k < 1800 ? 20 : -6)),
  // 95 km/h for the first 5 minutes, then 50.
  speed: secs(2400, (k) => (k < 300 ? 95 : 50)),
  grade: secs(120, (k) => (k < 60 ? 4 : 0)),
  legs: [{ start: t0, end: t0 + 2_400_000 }],
  usableKwh: 59,
  climate: null,
};

describe("a drive's tips: findings", () => {
  const findings = driveFindings(input);

  test("hard moments against the usual, with what regen won back", () => {
    expect(findings[0]).toMatchObject({ kind: "hardMoments", facts: { hardMoments: 4, hardBrakes: 3, hardStarts: 1, usualHardMomentsPerDrive: 1, regenWonBack: "1.0 kWh", energyDrawn: "10.0 kWh" } });
  });

  test("energy use against the usual, with range on a full charge worked out by code", () => {
    const f = findings.find((x) => x.kind === "energyUse")!;
    expect(f.facts).toMatchObject({ thisDrive: "168 Wh/km", usual: "131 Wh/km", compared: "28% more than usual", fullChargeAtThisDrivesUse: "351 km", fullChargeAtUsualUse: "450 km" });
  });

  test("time above 80 km/h and climbs", () => {
    expect(timeAbove(input.speed)).toBe(300_000);
    expect(findings.find((x) => x.kind === "speed")!.facts).toMatchObject({ topSpeed: "95 km/h", timeAbove80: "5 min" });
    expect(findings.find((x) => x.kind === "climbs")!.facts).toMatchObject({ climbs: 1, steepest: "4%" });
  });

  test("every demo line passes the same checks as the AI's", () => {
    for (const f of findings) expect(tipProblem(f.say, [f])).toBeNull();
  });

  test("a smooth drive close to the usual, with no usual, says little", () => {
    const calm = driveFindings({ ...input, moments: [], usual: { whPerKm: null, hard: 0 }, speed: secs(60, () => 40), grade: [] });
    expect(calm.map((f) => f.kind)).toEqual(["regen"]);
    expect(driveFindings({ ...input, moments: null, power: [], usual: { whPerKm: null, hard: null }, speed: [], grade: [] })).toEqual([]);
  });
});

describe("a drive's tips: climate", () => {
  const MIN = 60_000;
  const climate: ClimateSummary = { totalMs: 65 * MIN, onMs: 56 * MIN, set: { low: 21, high: 24 }, insideStart: 21.9, insideEnd: 22.8, outside: { low: 24.5, high: 26.5 } };
  const find = (c: ClimateSummary | null) => driveFindings({ ...input, climate: c }).find((f) => f.kind === "climate");

  test("AC on: the set temperature, inside and outside, as plain facts with a physics hint", () => {
    const f = find(climate)!;
    expect(f.facts).toEqual({
      acOn: "56 min of 1 h 5 min",
      setTemperature: "21 to 24 °C",
      insideAtStart: "21.9 °C",
      insideAtEnd: "22.8 °C",
      outside: "24.5 to 26.5 °C",
      setBelowOutside: null,
    });
    expect(f.causes).toEqual(["climate"]);
    expect(f.hint).toBe("A slightly warmer set point makes the AC work less.");
    // Never a claim about how much energy the AC used.
    expect(JSON.stringify(f)).not.toMatch(/kwh|saves?|wasted/i);
  });

  test("ranks as info next to a set point near the weather outside, and as a change when far below it", () => {
    expect(find(climate)!.score).toBeLessThan(1000);
    const far = find({ ...climate, set: { low: 18, high: 18 }, outside: { low: 28, high: 34 } })!;
    expect(far.score).toBeGreaterThan(1000);
    expect(far.facts.setBelowOutside).toBe("10 °C");
    expect(far.say).toBe("The AC was set to 18 °C, 10 °C below the 28 to 34 °C outside. A slightly warmer set point makes it work less.");
  });

  test("the gap is the warmest setting against the coolest outside, and under 8 °C it isn't called far", () => {
    expect(find({ ...climate, set: { low: 20, high: 22 }, outside: { low: 29, high: 34 } })!.facts.setBelowOutside).toBeNull();
    expect(find({ ...climate, set: { low: 20, high: 22 }, outside: { low: 30, high: 34 } })!.facts.setBelowOutside).toBe("8 °C");
  });

  test("nothing when the AC was off, on only briefly, unknown, or no set temperature", () => {
    expect(find(null)).toBeUndefined();
    expect(find({ ...climate, onMs: 0 })).toBeUndefined();
    expect(find({ ...climate, onMs: null })).toBeUndefined();
    expect(find({ ...climate, onMs: MIN })).toBeUndefined();
    expect(find({ ...climate, set: null })).toBeUndefined();
  });

  test("the whole drive, and no outside reading", () => {
    const f = find({ ...climate, onMs: climate.totalMs, outside: null })!;
    expect(f.facts).toMatchObject({ acOn: "the whole drive", outside: null, setBelowOutside: null });
    expect(f.say).toBe("The AC was set to 21 to 24 °C. A slightly warmer set point makes it work less.");
  });

  test("its demo line and a tip about the AC pass the same checks as the AI's", () => {
    const f = find(climate)!;
    expect(tipProblem(f.say, [f])).toBeNull();
    expect(checkTips({ tips: [{ kind: "climate", text: "Your AC was set to 21 to 24 °C. A slightly warmer set point makes it work less." }] }, [f])).toHaveLength(1);
  });

  test("a finding that holds no climate cause can't name the AC's cooling", () => {
    const f = { ...find(climate)!, causes: undefined };
    expect(checkTips({ tips: [{ kind: "climate", text: "Cooling to 21 to 24 °C takes work." }] }, [f])).toHaveLength(0);
  });
});
