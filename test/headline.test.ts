import { describe, expect, test } from "bun:test";
import { comparedWith, headline } from "@/lib/dashboard-summary";
import { CONSUMPTION_DAYS, recentConsumption } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";
import { formatMoney } from "@/lib/format";

// The sentence a chart opens with: the period's figure, then the span before where it can be compared.

describe("comparedWith", () => {
  test("more or less, with the unit, than the span before", () => {
    expect(comparedWith(130.6, 108.9, "km", "the 7 days before", { decimals: 1 })).toBe("21.7 km more than the 7 days before");
    expect(comparedWith(14.6, 18.2, "kWh", "yesterday", { decimals: 1 })).toBe("3.6 kWh less than yesterday");
  });
  test("money through its formatter, less or more: never better or worse", () => {
    const money = (n: number) => formatMoney(n, "INR");
    expect(comparedWith(1240, 1550, money, "1 to 26 Sept", { decimals: 2 })).toBe("₹310.00 less than 1 to 26 Sept");
    expect(comparedWith(1240, 1000, money, "1 to 26 Sept", { decimals: 2 })).toBe("₹240.00 more than 1 to 26 Sept");
  });
  test("lower is better words it as better or worse", () => {
    expect(comparedWith(112, 116, "Wh/km", "the 7 days before", { lowerIsBetter: true })).toBe("4 Wh/km better than the 7 days before");
    expect(comparedWith(120, 116, "Wh/km", "the 7 days before", { lowerIsBetter: true })).toBe("4 Wh/km worse than the 7 days before");
  });
  test("within 2% reads the same as, in the sentence's own words", () => {
    expect(comparedWith(186, 184, "kWh", "the 7 days before", { decimals: 1 })).toBe("the same as the 7 days before");
  });
  test("nothing to compare: All, a span tracking doesn't cover, or nothing yet this period", () => {
    expect(comparedWith(130.6, 108.9, "km", null, { decimals: 1 })).toBeNull();
    expect(comparedWith(130.6, null, "km", "the 7 days before", { decimals: 1 })).toBeNull();
    expect(comparedWith(0, 108.9, "km", "the 7 days before", { decimals: 1 })).toBeNull();
    expect(comparedWith(null, 108.9, "km", "the 7 days before", { decimals: 1 })).toBeNull();
  });
});

describe("headline", () => {
  test("one sentence: the lead, the comparison, a full stop", () => {
    expect(headline("Driven in the last 7 days", "21.7 km more than the 7 days before")).toBe("Driven in the last 7 days, 21.7 km more than the 7 days before.");
  });
  test("the lead alone without a comparison", () => {
    expect(headline("Driven in total", null)).toBe("Driven in total.");
  });
});

describe("recentConsumption", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-10-26T12:00:00+05:30");
  const drive = (km: number, kwh: number | null, daysAgo: number): Drive => ({
    start: now - daysAgo * DAY,
    end: now - daysAgo * DAY + 30 * 60_000,
    km,
    kwh,
    whPerKm: kwh === null ? null : (kwh * 1000) / km,
    startLevel: null,
    endLevel: null,
  });
  test("the average over the last 30 days of drives with an energy figure, and the distance behind it", () => {
    const usage = recentConsumption([drive(40, 6, 1), drive(60, 9, 10), drive(100, 20, CONSUMPTION_DAYS + 5), drive(50, null, 2)], now)!;
    expect(usage.km).toBe(100);
    expect(usage.whPerKm).toBe(150);
  });
  test("nothing under 10 km, or with no energy figure at all", () => {
    expect(recentConsumption([drive(4, 0.6, 1), drive(3, 0.5, 2)], now)).toBeNull();
    expect(recentConsumption([drive(40, null, 1)], now)).toBeNull();
    expect(recentConsumption([], now)).toBeNull();
  });
});
