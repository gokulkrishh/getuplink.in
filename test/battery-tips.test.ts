import { describe, expect, test } from "bun:test";
import { tipProblem } from "@/lib/ai-tips";
import type { DayStrip } from "@/lib/awake";
import { batteryFindings, parkedWakes } from "@/lib/battery-tips";
import type { ParkedPeriod } from "@/lib/drives";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.parse("2026-10-27T12:00:00+05:30");
const park = (start: number, hours: number, kwh: number): ParkedPeriod => ({
  start,
  end: start + hours * HOUR,
  hours,
  lostPercent: kwh * 1.7,
  lostKm: null,
  kwh,
  watts: (kwh * 1000) / hours,
  awakeMs: HOUR,
  percentPerDay: ((kwh * 1.7) / hours) * 24,
  kmPerDay: null,
});
const parked = [park(now - 20 * DAY, 24, 0.5), park(now - 15 * DAY, 24, 0.6), park(now - 10 * DAY, 24, 0.5), park(now - 4 * DAY, 24, 3.6)];
// Two days of strips around the last stretch: asleep, with three short wakes.
const start = parked[3].start;
const presence: DayStrip[] = [
  {
    day: 0,
    start,
    runs: [
      { start, end: start + HOUR, state: "online", seen: [] },
      { start: start + HOUR, end: start + 5 * HOUR, state: "asleep", seen: [] },
      { start: start + 5 * HOUR, end: start + 5.5 * HOUR, state: "online", seen: [] },
      { start: start + 5.5 * HOUR, end: start + 12 * HOUR, state: "asleep", seen: [] },
      { start: start + 12 * HOUR, end: start + 12.5 * HOUR, state: "online", seen: [] },
      { start: start + 12.5 * HOUR, end: start + 30 * HOUR, state: "asleep", seen: [] },
    ],
  },
];
const level = [5, 4, 3, 2, 1].map((d) => ({ at: now - d * DAY, level: d === 3 ? 95 : d === 2 ? 15 : 70 }));

describe("Stats > Battery tips: findings", () => {
  const findings = batteryFindings({ parked, presence, level, avgPrice: 20, now });

  test("what parking cost, the heavy stretch, the wakes and the charge level habits", () => {
    expect(findings.map((f) => f.kind)).toEqual(["parkedLoss", "heavyDrain", "wakes", "highDays", "lowestLevel"]);
    expect(findings[0].facts).toMatchObject({ lostPerDayParked: "3.6 kWh", costPerDayParked: "₹72.00", atWhatYouPay: "₹20.00/kWh" });
    expect(findings[1].facts).toMatchObject({ drew: "150 W", usuallyDraws: "23 W", extraCostPerDay: "₹61.00" });
    expect(findings[2].facts).toMatchObject({ wakesPerDayParked: "2.0", seenAwakePerDay: "at least 1 h" });
    expect(findings[3].facts).toMatchObject({ daysEndedAbove90: 1, days: 5 });
  });

  test("a wake already under way when the car parked isn't counted", () => {
    expect(parkedWakes([parked[3]], presence)).toMatchObject({ wakes: 2, awakeMs: HOUR });
  });

  test("every demo line passes the same checks as the AI's", () => {
    for (const f of findings) expect(tipProblem(f.say, [f])).toBeNull();
  });

  test("with no parked stretches or levels, nothing", () => {
    expect(batteryFindings({ parked: [], presence: [], level: [], avgPrice: null, now })).toEqual([]);
  });

  test("Home only takes a heavy stretch from its own week", () => {
    expect(batteryFindings({ parked, presence: [], level: [], avgPrice: 20, now, heavyFrom: now - 2 * DAY }).some((f) => f.kind === "heavyDrain")).toBe(false);
  });
});
