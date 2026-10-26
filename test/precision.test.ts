import { describe, expect, test } from "bun:test";
import { MILES_TO_KM } from "@/lib/car";
import { type CounterColumn, drivingFigures, figureInstants } from "@/lib/driving-figures";
import {
  apportion,
  DECIMALS,
  formatCelsius,
  formatKm,
  formatKw,
  formatKwh,
  formatLevels,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPower,
  formatRangeKm,
  formatSpeed,
  shownTotal,
} from "@/lib/format";
import type { Drive } from "@/lib/drives";
import { monthlyRows } from "@/lib/monthly";
import { dailyDistance, dayBounds } from "@/lib/telemetry-derive";
import { groupTrips, shownTrip, shownTrips } from "@/lib/trips";

// The numbers a reader would add up: "46.2 km" is 46.2, "₹1,234.50" is 1234.5.
const read = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));
// Adds shown figures in whole last-digit units, so the sum itself has no float noise.
const sumShown = (texts: string[], decimals: number) => texts.reduce((sum, t) => sum + Math.round(read(t) * 10 ** decimals), 0) / 10 ** decimals;

describe("format rules per unit", () => {
  test("distance driven: one decimal, Indian grouping, the trailing zero kept", () => {
    expect(formatKm(46.215)).toBe("46.2 km");
    expect(formatKm(100.008)).toBe("100.0 km");
    expect(formatKm(123_400.46)).toBe("1,23,400.5 km");
    expect(formatKm(0)).toBe("0 km");
  });
  test("range is the car's estimate: whole km", () => {
    expect(formatRangeKm(287.4)).toBe("287 km");
  });
  test("energy: one decimal", () => {
    expect(formatKwh(11.056)).toBe("11.1 kWh");
    expect(formatKwh(1234.56)).toBe("1,234.6 kWh");
    expect(formatKwh(0)).toBe("0 kWh");
  });
  test("power: one decimal in kW, watts below 1 kW", () => {
    expect(formatKw(7.24)).toBe("7.2 kW");
    expect(formatKw(150)).toBe("150.0 kW");
    expect(formatPower(24.4)).toBe("24 W");
    expect(formatPower(4.46)).toBe("4.5 W");
    expect(formatPower(1234)).toBe("1.2 kW");
  });
  test("money: to the paisa", () => {
    expect(formatMoney(874.5, "INR")).toBe("₹874.50");
    expect(formatMoney(1234.567, "INR")).toBe("₹1,234.57");
  });
  test("battery level and shares: whole percent; drain to one decimal", () => {
    expect(formatPercent(66.4)).toBe("66%");
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

describe("apportion and shownTotal", () => {
  // A week of days by the odometer: no reading on the first two, three days of driving.
  const week = [null, null, 0, 46.215, 0, 7.416, 46.377];

  test("a week with three drives: the days add up to the week as shown", () => {
    const { parts, total } = shownTotal(week, DECIMALS.km);
    expect(parts).toEqual([null, null, 0, 46.2, 0, 7.4, 46.4]);
    expect(total).toBe(100);
    expect(formatKm(total)).toBe("100.0 km");
    // Rounded alone, to whole km, the same days read 46 + 7 + 46 = 99 against 100.
    expect(Math.round(46.215) + Math.round(7.416) + Math.round(46.377)).toBe(99);
  });

  test("the case plain rounding gets wrong: three thirds", () => {
    const parts = apportion([1 / 3, 1 / 3, 1 / 3], 1);
    expect(parts.reduce((a, b) => a! + b!, 0)).toBeCloseTo(1, 10);
    expect(apportion([33.4, 33.3, 33.3], 0)).toEqual([34, 33, 33]);
  });

  test("zero stays zero, null stays null, an empty list totals 0", () => {
    expect(apportion([0, null, 0.06, 0.06], 1)).toEqual([0, null, 0.1, 0]);
    expect(shownTotal([], 1)).toEqual({ parts: [], total: 0 });
    expect(shownTotal([null, null], 1)).toEqual({ parts: [null, null], total: 0 });
  });

  test("a part's own value already at the precision is never moved", () => {
    expect(apportion([1.2, 3.4, 0.05, 0.05], 1)).toEqual([1.2, 3.4, 0.1, 0]);
  });

  test("a stacked column's segments add up to the column as shown", () => {
    // Three chargers in one column, the column already rounded to 12.1 with its neighbours.
    const segments = apportion([4.04, 4.04, 4.04], 1, 12.1);
    expect(sumShown(segments.map((v) => formatKwh(v!)), 1)).toBe(12.1);
    expect(apportion([4.06, 4.06, 4.06], 1, 12.1)).toEqual([4.1, 4, 4]);
  });

  test("for any values, the shown parts add up to the shown total, each within a last digit", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let run = 0; run < 500; run++) {
      const decimals = run % 3;
      const values = Array.from({ length: 1 + Math.floor(random() * 30) }, () => (random() < 0.1 ? null : random() < 0.1 ? 0 : random() * 500));
      const { parts, total } = shownTotal(values, decimals);
      const shown = parts.flatMap((v) => (v === null ? [] : [formatNumber(v, decimals)]));
      expect(sumShown(shown, decimals)).toBe(read(formatNumber(total, decimals)));
      const raw = values.reduce<number>((a, v) => a + (v ?? 0), 0);
      expect(Math.abs(total - raw)).toBeLessThanOrEqual(0.5 * 10 ** -decimals + 1e-9);
      parts.forEach((v, k) => {
        if (values[k] === null) expect(v).toBeNull();
        else expect(Math.abs(v! - values[k]!)).toBeLessThan(10 ** -decimals + 1e-9);
        if (values[k] === 0) expect(v).toBe(0);
      });
    }
  });
});

const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("Distance: the bars add up to the headline as shown", () => {
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
  const figures = drivingFigures({ instants, odometer: column(readings), used: null, regen: null, polledOdometer: null }, now);
  const week = figures.periods.week;

  test("kilometres are kept unrounded", () => {
    expect(week.current.km).toBeCloseTo((2134.166569195353 - 2072.0244760504906) * MILES_TO_KM, 9);
  });

  test("the headline is the sum of the bars, rounded with them", () => {
    const { parts, total } = shownTotal(
      week.bars.map((b) => b.km),
      DECIMALS.km,
    );
    const shown = parts.flatMap((v) => (v === null ? [] : [formatKm(v)]));
    expect(shown.filter((s) => s !== "0 km")).toEqual(["46.2 km", "7.4 km", "46.4 km"]);
    expect(formatKm(total)).toBe("100.0 km");
    expect(sumShown(shown, 1)).toBe(read(formatKm(total)));
    // The bars share their edges, so their raw sum is the period's own figure.
    expect(week.bars.reduce((s, b) => s + (b.km ?? 0), 0)).toBeCloseTo(week.current.km!, 9);
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
    const days = dailyDistance(streamed, { at: ist("2026-03-12T10:00:00"), value: 2072.0244760504906 }, now, 4, polled);
    const km = days.map((d) => d.km);
    expect(km[0]).toBeCloseTo((2100.7411470637076 - 2072.0244760504906) * MILES_TO_KM, 9);
    expect(km[1]).toBe(0);
    expect(km[2]).toBeCloseTo((2105.349236 - 2100.7411470637076) * MILES_TO_KM, 9);
    expect(km[3]).toBeCloseTo((2134.166569195353 - 2105.349236) * MILES_TO_KM, 9);
    expect(shownTotal(km, 1).parts).toEqual([46.2, 0, 7.4, 46.4]);
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

describe("trips: the legs and rows add up to their totals as shown", () => {
  test("a trip with three legs", () => {
    const [trip] = groupTrips([drive("2026-03-13T08:00:00", 20, 12.35, 2.05), drive("2026-03-13T08:30:00", 20, 12.35, 2.05), drive("2026-03-13T09:00:00", 20, 12.35, 2.05)]);
    expect(formatKm(trip.km)).toBe("37.1 km");
    const shown = shownTrip(trip);
    expect(formatKm(shown.km)).toBe("37.1 km");
    expect(sumShown(shown.legs.map((d) => formatKm(d.km)), 1)).toBe(37.1);
    expect(sumShown(shown.legs.map((d) => formatKwh(d.kwh!)), 1)).toBe(read(formatKwh(shown.kwh!)));
  });

  test("a list of trips and its total", () => {
    const trips = groupTrips([drive("2026-03-13T08:00:00", 20, 0.35, 0.1), drive("2026-03-13T12:00:00", 20, 0.35, 0.1), drive("2026-03-13T16:00:00", 20, 0.35, null)]);
    const shown = shownTrips(trips);
    expect(formatKm(shown.km)).toBe("1.1 km");
    expect(sumShown(shown.trips.map((t) => formatKm(t.km)), 1)).toBe(1.1);
    expect(shown.kwh).toBeNull();
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
