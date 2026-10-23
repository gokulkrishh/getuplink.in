import { describe, expect, test } from "bun:test";
import { MILES_TO_KM } from "@/lib/car";
import { type CounterColumn, drivingFigures, figureInstants } from "@/lib/driving-figures";

const ist = (local: string) => Date.parse(`${local}+05:30`);
const DAY = 86_400_000;
const now = ist("2026-10-22T14:00:00");
const instants = figureInstants(now);

// A counter read at these times, as the loader would return it: the last reading before each instant.
function column(readings: [at: number, value: number][]): CounterColumn {
  const sorted = readings.map(([at, value]) => ({ at, value })).sort((a, b) => a.at - b.at);
  return { first: sorted[0] ?? null, bounds: instants.map((t) => sorted.findLast((r) => r.at < t) ?? null) };
}

// One reading a day at noon IST from `from` until now, rising by `perDay`.
function daily(from: number, start: number, perDay: number): [number, number][] {
  const out: [number, number][] = [];
  for (let t = from, v = start; t < now; t += DAY, v += perDay) out.push([t, v]);
  return out;
}

const km = (miles: number) => Math.round(miles * MILES_TO_KM);

describe("figureInstants", () => {
  test("sorted, without duplicates, ending with Infinity for the latest reading", () => {
    expect(instants.at(-1)).toBe(Infinity);
    expect(new Set(instants).size).toBe(instants.length);
    expect([...instants].sort((a, b) => a - b)).toEqual(instants);
    expect(instants.filter((t) => Number.isFinite(t)).every((t) => t <= now)).toBe(true);
  });
});

describe("drivingFigures", () => {
  // 10 miles and 1.5 kWh a day since 1 Jan 2026.
  const start = ist("2026-01-01T12:00:00");
  const odometer = column(daily(start, 1000, 10));
  const used = column(daily(start, 500, 1.5));
  const figures = drivingFigures({ instants, odometer, used, regen: null, polledOdometer: null }, now);

  test("week: the last 7 days against the 7 before", () => {
    expect(figures.periods.week.current.km).toBe(km(70));
    expect(figures.periods.week.previous?.km).toBe(km(70));
    expect(figures.periods.week.bars.map((b) => b.km)).toEqual(Array(7).fill(km(10)));
  });
  test("month: to date against the same days of last month", () => {
    // 1–22 Oct at 14:00 has 22 noon readings; so does 1–22 Sept.
    expect(figures.periods.month.current.km).toBe(km(220));
    expect(figures.periods.month.previous?.km).toBe(km(220));
  });
  test("Wh/km from the energy counter over the streamed distance", () => {
    expect(figures.periods.month.current.whPerKm).toBeCloseTo((1.5 * 1000) / (10 * MILES_TO_KM), 6);
  });
  test("all: everything since the first reading, with nothing to compare", () => {
    expect(figures.periods.all.current.km).toBe(km(10 * (daily(start, 0, 1).length - 1)));
    expect(figures.periods.all.previous).toBeNull();
    expect(figures.since).toBe(start);
    expect(figures.odometerKm).toBe(km(1000 + 10 * (daily(start, 0, 1).length - 1)));
  });
  test("year: no comparison before tracking began", () => {
    expect(figures.periods.year.previous?.km).toBeNull();
  });

  test("a car tracked for 3 days: figures count from the first reading, nothing is compared", () => {
    const from = ist("2026-10-19T12:00:00");
    const recent = drivingFigures({ instants, odometer: column(daily(from, 5000, 20)), used: null, regen: null, polledOdometer: null }, now);
    expect(recent.periods.week.current.km).toBe(km(60));
    expect(recent.periods.week.previous?.km).toBeNull();
    expect(recent.since).toBe(from);
  });

  test("the polled odometer covers the months before the stream began", () => {
    // Polls every day from 1 Aug; the stream only from 1 Oct.
    const polled = column(daily(ist("2026-08-01T12:00:00"), 2000, 10));
    const streamed = column(daily(ist("2026-10-01T12:30:00"), 2000 + 10 * 61, 10));
    const merged = drivingFigures({ instants, odometer: streamed, used: null, regen: null, polledOdometer: polled }, now);
    expect(merged.periods.month.previous?.km).toBe(km(220));
    expect(merged.since).toBe(ist("2026-08-01T12:00:00"));
  });

  test("energy use needs enough distance", () => {
    // 1 mile a day: a week is about 11 km (enough), a month to date about 35 km (under 50).
    const slow = drivingFigures({ instants, odometer: column(daily(start, 0, 1)), used: column(daily(start, 0, 0.5)), regen: null, polledOdometer: null }, now);
    expect(slow.periods.week.current.whPerKm).not.toBeNull();
    expect(slow.periods.month.current.whPerKm).toBeNull();
  });

  test("regen rises like any counter", () => {
    const regen = drivingFigures({ instants, odometer, used, regen: column(daily(start, 0, 0.25)), polledOdometer: null }, now);
    expect(regen.periods.week.current.regenKwh).toBeCloseTo(1.75, 6);
  });

  test("no counters: every figure is empty", () => {
    const none = drivingFigures({ instants, odometer: null, used: null, regen: null, polledOdometer: null }, now);
    expect(none.periods.month.current).toEqual({ km: null, whPerKm: null, kwh: null, regenKwh: null });
    expect(none.since).toBeNull();
    expect(none.odometerKm).toBeNull();
  });
});
