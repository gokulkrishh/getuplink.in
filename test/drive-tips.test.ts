import { describe, expect, test } from "bun:test";
import { tipProblem } from "@/lib/ai-tips";
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
