import { describe, expect, test } from "bun:test";
import { MILES_TO_KM } from "@/lib/car";
import { type CounterColumn, drivingFigures, figureInstants } from "@/lib/driving-figures";
import {
  DECIMALS,
  formatCelsius,
  formatKm,
  formatKw,
  formatKwh,
  formatLevels,
  formatMoney,
  formatNumber,
  showsZero,
  formatPercent,
  formatPower,
  formatRangeKm,
  formatSpeed,
  sumKnown,
} from "@/lib/format";
import type { Drive } from "@/lib/drives";
import { monthlyRows } from "@/lib/monthly";
import { dailyDistance, dayBounds } from "@/lib/telemetry-derive";
import { groupTrips } from "@/lib/trips";

// The number a reader sees: "46.2 km" is 46.2, "₹1,234.50" is 1234.5.
const read = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

describe("format rules per unit", () => {
  test("distance: always one decimal, the trailing zero and zero itself included", () => {
    expect(formatKm(46.215)).toBe("46.2 km");
    expect(formatKm(46)).toBe("46.0 km");
    expect(formatKm(100.008)).toBe("100.0 km");
    expect(formatKm(123_400.46)).toBe("1,23,400.5 km");
    expect(formatKm(0)).toBe("0.0 km");
  });
  test("range is the car's estimate: whole km", () => {
    expect(formatRangeKm(287.4)).toBe("287 km");
  });
  test("energy: always one decimal", () => {
    expect(formatKwh(11.056)).toBe("11.1 kWh");
    expect(formatKwh(1234.56)).toBe("1,234.6 kWh");
    expect(formatKwh(0)).toBe("0.0 kWh");
  });
  test("power: one decimal in kW, watts below 1 kW", () => {
    expect(formatKw(7.24)).toBe("7.2 kW");
    expect(formatKw(7)).toBe("7.0 kW");
    expect(formatPower(24.4)).toBe("24 W");
    expect(formatPower(4.46)).toBe("4.5 W");
    expect(formatPower(1234)).toBe("1.2 kW");
  });
  test("money: to the paisa", () => {
    expect(formatMoney(874.5, "INR")).toBe("₹874.50");
    expect(formatMoney(0, "INR")).toBe("₹0.00");
    expect(formatMoney(1234.567, "INR")).toBe("₹1,234.57");
  });
  test("battery level and shares: whole percent; drain to one decimal", () => {
    expect(formatPercent(66.4)).toBe("66%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1.44, 1)).toBe("1.4%");
    expect(formatLevels(58.4, 51.2)).toBe("58% to 51%");
  });
  test("speed whole, temperature up to one decimal", () => {
    expect(formatSpeed(92.4)).toBe("92 km/h");
    expect(formatCelsius(35.5)).toBe("35.5 °C");
    expect(formatCelsius(30)).toBe("30 °C");
  });
  test("halves round up, despite float noise, and never read as -0", () => {
    expect(formatNumber(1.15, 1)).toBe("1.2");
    expect(formatNumber(2.675, 2)).toBe("2.68");
    expect(formatNumber(-0.01, 1)).toBe("0.0");
  });
});

describe("one quantity, one reading", () => {
  test("a value reads the same digits wherever it is shown: never nudged to make a sum match", () => {
    // The same day's distance on its bar, its tip, its trip row and its month: one formatter, one result.
    const day = 41.0705;
    expect(new Set([formatKm(day), formatKm(day), formatKm(day)])).toEqual(new Set(["41.1 km"]));
  });

  test("a total is the raw sum of the same parts, rounded once", () => {
    // A week with three drives, as the odometer read it.
    const week = [null, null, 0, 46.215, 0, 7.416, 46.377];
    expect(week.map((v) => (v === null ? "" : formatKm(v)))).toEqual(["", "", "0.0 km", "46.2 km", "0.0 km", "7.4 km", "46.4 km"]);
    expect(formatKm(sumKnown(week))).toBe("100.0 km");
  });

  test("shown parts can sit a last digit off the shown total; both stay honest", () => {
    const parts = [0.35, 0.35, 0.35];
    expect(parts.map(formatKm)).toEqual(["0.4 km", "0.4 km", "0.4 km"]);
    expect(formatKm(sumKnown(parts))).toBe("1.1 km");
    // Rounded alone, each part is never more than half a last digit from its value.
    for (const v of [0.35, 46.215, 7.416, 1234.56]) expect(Math.abs(read(formatKm(v)) - v)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  test("sumKnown skips unknown parts", () => {
    expect(sumKnown([null, undefined, 1.5, 2])).toBe(3.5);
    expect(sumKnown([])).toBe(0);
  });
});

const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("Distance: the headline and the bars come from one source", () => {
  // The odometer (miles) of a week with three drives, read once at each change, as the stream sends it.
  const now = ist("2026-03-16T09:30:00");
  const instants = figureInstants(now);
  const readings: [number, number][] = [
    [ist("2026-03-11T19:00:00"), 2072.0244760504906],
    [ist("2026-03-13T18:40:00"), 2100.7411470637076],
    [ist("2026-03-15T21:10:00"), 2105.349236],
    [ist("2026-03-16T08:57:00"), 2134.166569195353],
  ];
  const column = (rows: [number, number][]): CounterColumn => {
    const sorted = rows.map(([at, value]) => ({ at, value }));
    return { first: sorted[0], bounds: instants.map((t) => sorted.findLast((r) => r.at < t) ?? null) };
  };
  const week = drivingFigures({ instants, odometer: column(readings), used: null, regen: null, polledOdometer: null }, now).periods.week;

  test("kilometres are kept unrounded", () => {
    expect(week.current.km).toBeCloseTo((2134.166569195353 - 2072.0244760504906) * MILES_TO_KM, 9);
  });

  test("the bars' raw sum is the period's figure, and each reads its own rounding", () => {
    expect(sumKnown(week.bars.map((b) => b.km))).toBeCloseTo(week.current.km!, 9);
    expect(week.bars.flatMap((b) => (b.km ? [formatKm(b.km)] : []))).toEqual(["46.2 km", "7.4 km", "46.4 km"]);
    expect(formatKm(sumKnown(week.bars.map((b) => b.km)))).toBe("100.0 km");
  });
});

describe("dailyDistance", () => {
  const now = ist("2026-03-16T09:30:00");
  const at = (local: string) => new Date(ist(local)).toISOString();

  test("unrounded, and a later poll at a midnight counts, as the Distance bars merge them", () => {
    const streamed = [
      { at: at("2026-03-13T18:40:00"), value: 2100.7411470637076 },
      { at: at("2026-03-15T19:00:00"), value: 2105.279642467376 },
      { at: at("2026-03-16T08:57:00"), value: 2134.166569195353 },
    ];
    const bounds = dayBounds(now, 4);
    expect(bounds[3]).toBe(ist("2026-03-16T00:00:00"));
    // The poll read at 11:50 PM on the third day is newer than the stream's last reading of it.
    const polled = bounds.map((_, k) => (k === 3 ? { at: ist("2026-03-15T23:50:00"), value: 2105.349236 } : null));
    const km = dailyDistance(streamed, { at: ist("2026-03-12T10:00:00"), value: 2072.0244760504906 }, now, 4, polled).map((d) => d.km);
    expect(km[0]).toBeCloseTo((2100.7411470637076 - 2072.0244760504906) * MILES_TO_KM, 9);
    expect(km[1]).toBe(0);
    expect(km[2]).toBeCloseTo((2105.349236 - 2100.7411470637076) * MILES_TO_KM, 9);
    expect(km[3]).toBeCloseTo((2134.166569195353 - 2105.349236) * MILES_TO_KM, 9);
    expect(km.map((v) => formatKm(v!))).toEqual(["46.2 km", "0.0 km", "7.4 km", "46.4 km"]);
  });

  test("before the first reading a day is blank; after it a day without one is 0", () => {
    const days = dailyDistance([{ at: at("2026-03-15T12:00:00"), value: 100 }], null, now, 3);
    expect(days.map((d) => d.km)).toEqual([null, null, 0]);
  });
});

const drive = (start: string, minutes: number, km: number, kwh: number | null): Drive => ({
  start: ist(start),
  end: ist(start) + minutes * 60_000,
  km,
  kwh,
  whPerKm: null,
  startLevel: 80,
  endLevel: 70,
});

describe("trips: a trip's totals are its legs' raw sums", () => {
  test("a trip with three legs", () => {
    const [trip] = groupTrips([drive("2026-03-13T08:00:00", 20, 12.35, 2.05), drive("2026-03-13T08:30:00", 20, 12.35, 2.05), drive("2026-03-13T09:00:00", 20, 12.35, 2.05)]);
    expect(trip.km).toBeCloseTo(37.05, 9);
    expect(formatKm(trip.km)).toBe("37.1 km");
    expect(trip.legs.map((d) => formatKm(d.km))).toEqual(["12.4 km", "12.4 km", "12.4 km"]);
    expect(formatKwh(trip.kwh!)).toBe("6.2 kWh");
  });
});

describe("monthlyRows", () => {
  test("with the odometer's days, a month's km is their sum, not the drives'", () => {
    const now = ist("2026-03-16T09:30:00");
    const days = dailyDistance([{ at: new Date(ist("2026-03-16T08:00:00")).toISOString(), value: 110 }], { at: ist("2026-02-27T08:00:00"), value: 100 }, now, 20);
    const rows = monthlyRows([drive("2026-03-16T07:30:00", 30, 15, 2)], [], ist("2026-02-25T00:00:00"), now, days);
    expect(rows[0].km).toBeCloseTo(10 * MILES_TO_KM, 9);
    expect(rows[0].drivingMs).toBe(30 * 60_000);
  });
});

describe("showsZero", () => {
  test("a figure that rounds to zero at its precision draws no bar", () => {
    expect(showsZero(formatNumber(0.04, DECIMALS.km))).toBe(true);
    expect(showsZero(formatKm(0))).toBe(true);
    expect(showsZero(formatMoney(0.004, "INR"))).toBe(true);
    expect(showsZero(formatNumber(0, DECIMALS.percent))).toBe(true);
  });
  test("anything that shows a digit draws one", () => {
    expect(showsZero(formatNumber(0.05, DECIMALS.km))).toBe(false);
    expect(showsZero(formatKwh(10))).toBe(false);
    expect(showsZero(formatMoney(243.52, "INR"))).toBe(false);
  });
});
