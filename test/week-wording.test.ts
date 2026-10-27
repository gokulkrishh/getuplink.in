import { describe, expect, test } from "bun:test";
import { tipProblem, topFindings } from "@/lib/ai-tips";
import type { PricedCharge } from "@/lib/charge-tips";
import type { Drive, ParkedPeriod } from "@/lib/drives";
import type { DrivingPeriod } from "@/lib/driving-figures";
import type { Timeframe } from "@/lib/periods";
import { type WeekInput, weekFindings } from "@/lib/week-wording";

const DAY = 86_400_000;
const now = Date.parse("2026-10-27T12:00:00+05:30");
const from = now - 7 * DAY;
const frame = { span: { from, to: now } } as Timeframe;
const driving = { current: { km: 120, whPerKm: 150, kwh: 18, regenKwh: null }, previous: { km: 100, whPerKm: 128, kwh: 12.8, regenKwh: null } } as unknown as DrivingPeriod;
const drive = (dayAgo: number, km: number, kwh: number): Drive => ({ start: now - dayAgo * DAY, end: now - dayAgo * DAY + 1_800_000, km, kwh, whPerKm: km >= 1 ? (kwh * 1000) / km : null, startLevel: 70, endLevel: 65 });
const drives = [drive(1, 3, 0.6), drive(2, 4, 0.8), drive(3, 30, 3.9), drive(10, 20, 2.6), drive(12, 22, 2.8), drive(14, 25, 3.2), drive(16, 18, 2.4), drive(18, 30, 3.8)];
const charge = (id: string, dayAgo: number, name: string, area: string, kwh: number, cost: number): PricedCharge => ({ id, at: now - dayAgo * DAY, name, area, kwh, cost, kind: "dc" });
const priced = [charge("s1", 2, "IndianOil e-Charge, Sri Sakthi Agency", "Anthiyur", 20, 480), charge("s2", 20, "Statiq, Brigade Road", "Bengaluru", 20, 330), charge("s3", 25, "Statiq, Brigade Road", "Bengaluru", 10, 165)];
const park = (dayAgo: number, hours: number, kwh: number): ParkedPeriod => ({ start: now - dayAgo * DAY, end: now - dayAgo * DAY + hours * 3_600_000, hours, lostPercent: kwh * 1.6, lostKm: null, kwh, watts: (kwh * 1000) / hours, awakeMs: 0, percentPerDay: ((kwh * 1.6) / hours) * 24, kmPerDay: null });

const input: WeekInput = {
  frame,
  driving,
  drives,
  priced,
  parked: [park(5, 30, 1.2), park(3, 20, 0.6)],
  charges: [{ started_at: new Date(now - 2 * DAY).toISOString(), end_level: 95 }, { started_at: new Date(now - 4 * DAY).toISOString(), end_level: 80 }],
  odometerKm: 9_420,
  now,
};

describe("Home's week tips: findings", () => {
  const findings = weekFindings(input);
  const kinds = findings.map((f) => f.kind);

  test("each finding comes from the owner's own data", () => {
    expect(kinds).toEqual(["energyUse", "shortTrips", "chargingCost", "parkedLoss", "chargedAbove90", "tyreRotation"]);
    const cost = findings.find((f) => f.kind === "chargingCost")!;
    expect(cost.facts).toMatchObject({ thisWeek: "₹24.00/kWh", cheapest: { station: "Statiq, Brigade Road", price: "₹16.50/kWh" }, atCheapestWouldHaveSaved: "₹150.00" });
    expect(findings.find((f) => f.kind === "tyreRotation")!.facts).toMatchObject({ rotateAt: "10,000 km", toGo: "580 km" });
    expect(findings.find((f) => f.kind === "shortTrips")!.facts).toMatchObject({ shortTrips: 2, trips: 3, shortTripsUsed: "200 Wh/km", longerTripsUsed: "130 Wh/km" });
  });

  test("money saved ranks first", () => {
    expect(topFindings(findings)[0].kind).toBe("chargingCost");
  });

  test("every demo line passes the same checks as the AI's", () => {
    for (const f of findings) expect(tipProblem(f.say, [f])).toBeNull();
  });

  test("nothing is said without the data behind it", () => {
    const quiet = weekFindings({ ...input, driving: null, drives: [], priced: [], parked: [], charges: [], odometerKm: 3_434 });
    expect(quiet).toEqual([]);
    // One station only: nothing to compare the week's price with.
    expect(weekFindings({ ...input, priced: priced.slice(0, 1) }).some((f) => f.kind === "chargingCost")).toBe(false);
  });
});
