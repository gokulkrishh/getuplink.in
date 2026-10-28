import { describe, expect, test } from "bun:test";
import { withDriveEfficiency } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";
import { type CounterColumn, type DrivingCounters, type DrivingFigure, drivingFigures, figureInstants, timeframeInstants } from "@/lib/driving-figures";
import { monthIndex, monthShort } from "@/lib/periods";
import {
  fourEndingWith,
  type SeasonFigure,
  seasonComparison,
  seasonEfficiency,
  seasonMonths,
  seasonOf,
  seasonSentence,
  seasonStart,
  seasonTimeframe,
  seasonTotals,
  seasonWaiting,
} from "@/lib/seasons";

const ist = (local: string) => Date.parse(`${local}+05:30`);
const DAY = 86_400_000;
const now = ist("2026-10-22T14:00:00");
const month = (iso: string) => monthIndex(ist(`${iso}-15T12:00:00`));
const figure = (kwh: number | null, whPerKm: number | null): DrivingFigure => ({ km: null, whPerKm, kwh, regenKwh: null });

describe("seasonOf, in IST", () => {
  test("28 Feb 23:59:59 IST is winter, 1 Mar 00:00 IST is summer", () => {
    // 18:30 UTC is IST midnight.
    expect(seasonOf(Date.parse("2026-02-28T18:29:59Z"))).toBe("winter");
    expect(seasonOf(Date.parse("2026-02-28T18:30:00Z"))).toBe("summer");
  });
  test("31 May is summer, 1 Jun is monsoon", () => {
    expect(seasonOf(ist("2026-05-31T23:59:59"))).toBe("summer");
    expect(seasonOf(ist("2026-06-01T00:00:00"))).toBe("monsoon");
  });
  test("30 Sept is monsoon, 1 Oct is post-monsoon", () => {
    expect(seasonOf(ist("2026-09-30T23:59:59"))).toBe("monsoon");
    expect(seasonOf(ist("2026-10-01T00:00:00"))).toBe("postMonsoon");
  });
  test("30 Nov is post-monsoon, 1 Dec is winter, even though it is still 30 Nov in UTC", () => {
    expect(seasonOf(ist("2026-11-30T23:59:59"))).toBe("postMonsoon");
    expect(seasonOf(Date.parse("2026-11-30T18:30:00Z"))).toBe("winter");
  });
  test("31 Dec and 1 Jan are the same winter, which begins in December", () => {
    expect(seasonOf(ist("2025-12-31T12:00:00"))).toBe("winter");
    expect(seasonStart(monthIndex(ist("2025-12-31T12:00:00")))).toBe(month("2025-12"));
    expect(seasonStart(month("2026-01"))).toBe(month("2025-12"));
    expect(seasonStart(month("2026-02"))).toBe(month("2025-12"));
    expect(seasonStart(month("2026-08"))).toBe(month("2026-06"));
  });
});

describe("seasonTimeframe", () => {
  test("the months of the last four seasons, up to this month and none ahead", () => {
    const frame = seasonTimeframe(now);
    expect(frame.slots.map((s) => s.label)).toEqual(["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct"].map((m) => (m === "Sept" ? monthShort(month("2026-09")) : m)));
    expect(frame.slots[0].from).toBe(ist("2025-12-01T00:00:00"));
    expect(frame.slots.at(-1)!.isCurrent).toBe(true);
  });
  test("on 1 Mar, from the June before: summer has just begun, so no two runs of one season", () => {
    const frame = seasonTimeframe(ist("2026-03-01T00:00:00"));
    expect(frame.slots[0].from).toBe(ist("2025-06-01T00:00:00"));
    expect(frame.slots).toHaveLength(10);
    expect(new Set(frame.slots.map((s) => seasonStart(monthIndex(s.from)))).size).toBe(4);
  });
});

describe("seasonTotals", () => {
  test("weighted by distance, not a plain mean of the months", () => {
    // Jun: 10 kWh over 100 km (100 Wh/km); Jul: 40 kWh over 200 km (200 Wh/km). 50 kWh over 300 km.
    const [monsoon] = seasonTotals(
      [
        { index: month("2026-06"), figure: figure(10, 100) },
        { index: month("2026-07"), figure: figure(40, 200) },
      ],
      now,
    );
    expect(monsoon.season).toBe("monsoon");
    expect(monsoon.whPerKm).toBeCloseTo(166.67, 1);
    expect(monsoon.km).toBeCloseTo(300);
    expect(seasonMonths(monsoon)).toBe("Jun to Jul 2026");
  });
  test("a season without a figure is left out, never filled in", () => {
    const seasons = seasonTotals(
      [
        { index: month("2026-03"), figure: figure(20, 150) },
        { index: month("2026-06"), figure: figure(null, null) },
        { index: month("2026-10"), figure: figure(9, 160) },
      ],
      now,
    );
    expect(seasons.map((s) => s.season)).toEqual(["summer", "postMonsoon"]);
    expect(seasonMonths(seasons[1])).toBe("Oct 2026 so far");
  });
  test("a winter across the new year names both years", () => {
    const [winter] = seasonTotals(
      [
        { index: month("2025-12"), figure: figure(20, 150) },
        { index: month("2026-02"), figure: figure(20, 150) },
      ],
      now,
    );
    expect(seasonMonths(winter)).toBe("Dec 2025 to Feb 2026");
  });
});

describe("copy", () => {
  const s = (season: SeasonFigure["season"], whPerKm: number): SeasonFigure => ({ season, start: 0, first: 0, last: 0, current: false, whPerKm, kwh: 1, km: 1 });
  test("one figure per season, oldest first", () => {
    expect(seasonSentence([s("summer", 158.2), s("monsoon", 171)])).toBe("158 Wh/km in summer, 171 Wh/km in monsoon");
  });
  test("the most against the least", () => {
    expect(seasonComparison([s("summer", 158), s("monsoon", 171), s("postMonsoon", 160)])).toBe("Monsoon used 8% more energy per km than summer.");
    expect(seasonComparison([s("summer", 158), s("monsoon", 160)])).toBe("About the same in both seasons.");
    expect(seasonComparison([s("summer", 158)])).toBe(null);
  });
  test("with one season, what the comparison waits for", () => {
    expect(seasonWaiting("summer")).toBe("Comparison appears once you've driven in the monsoon.");
    expect(seasonWaiting("postMonsoon")).toBe("Comparison appears once you've driven in winter.");
  });
});

// Counters read at `instants`: the last reading before each, as the loader would return them.
function column(readings: { at: number; value: number }[], instants: number[]): CounterColumn {
  return { first: readings[0] ?? null, bounds: instants.map((t) => readings.findLast((r) => r.at < t) ?? null) };
}

describe("seasonEfficiency", () => {
  // A reading a day at noon IST since 1 Nov 2025: 10 miles, and more energy in the monsoon.
  const odometer: { at: number; value: number }[] = [];
  const used: { at: number; value: number }[] = [];
  for (let t = ist("2025-11-01T12:00:00"), miles = 1000, kwh = 500; t < now; t += DAY) {
    odometer.push({ at: t, value: miles });
    used.push({ at: t, value: kwh });
    miles += 10;
    kwh += seasonOf(t) === "monsoon" ? 2.8 : 2.4;
  }
  // The drives of the last 90 days: 16 km at 150 Wh/km each day.
  const drives: Drive[] = [];
  for (let t = now - 90 * DAY + DAY; t < now - DAY; t += DAY) drives.push({ start: t, end: t + 1_800_000, km: 16, kwh: 2.4, whPerKm: 150, startLevel: null, endLevel: null });
  const counters = (instants: number[]): DrivingCounters => ({ instants, odometer: column(odometer, instants), used: column(used, instants), regen: null, polledOdometer: null });

  const frame = seasonTimeframe(now);
  const result = seasonEfficiency(counters(timeframeInstants([frame], now)), frame, drives, now);
  const yearBars = withDriveEfficiency(drivingFigures(counters(figureInstants(now)), now), drives, now).periods.year.bars;
  // This year's months from the monthly bars, as the seasons combine them.
  const fromBars = (months: number[]) => {
    const counted = months.map((m) => yearBars[m]).filter((b) => b.whPerKm !== null);
    const kwh = counted.reduce((sum, b) => sum + b.kwh!, 0);
    return (kwh * 1000) / counted.reduce((sum, b) => sum + (b.kwh! * 1000) / b.whPerKm!, 0);
  };

  test("the four seasons, oldest first", () => {
    expect(result.seasons.map((s) => s.season)).toEqual(["winter", "summer", "monsoon", "postMonsoon"]);
  });
  test("agrees with the monthly bars", () => {
    const by = Object.fromEntries(result.seasons.map((s) => [s.season, s.whPerKm]));
    expect(by.summer).toBeCloseTo(fromBars([2, 3, 4]), 6);
    expect(by.monsoon).toBeCloseTo(fromBars([5, 6, 7, 8]), 6);
    expect(by.postMonsoon).toBeCloseTo(fromBars([9]), 6);
  });
  test("the months the drives cover read from them, and the note names the first", () => {
    expect(result.seasons.at(-1)!.whPerKm).toBeCloseTo(150);
    // 90 days before 22 Oct is 24 Jul, so August is the first whole month of drives.
    expect(result.drivesFrom).toBe(month("2026-08"));
  });
  test("nothing without counters", () => {
    const none: DrivingCounters = { instants: [], odometer: null, used: null, regen: null, polledOdometer: null };
    expect(seasonEfficiency(none, frame, [], now)).toEqual({ seasons: [], drivesFrom: null });
  });
});

describe("fourEndingWith", () => {
  test("the four seasons, oldest first, ending with the one given", () => {
    expect(fourEndingWith("postMonsoon")).toEqual(["winter", "summer", "monsoon", "postMonsoon"]);
    expect(fourEndingWith("winter")).toEqual(["summer", "monsoon", "postMonsoon", "winter"]);
  });
});
