import { describe, expect, test } from "bun:test";
import { customScope, periodQuery, statsHref, UPDATE_PERIODS, urlRange } from "@/components/stats/periods";
import { periodFrames } from "@/lib/frames";
import type { DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import { clipSpan, customRange, isoDay, reachesBefore, rangeTimeframe } from "@/lib/periods";

const ist = (local: string) => Date.parse(`${local}+05:30`);
const now = ist("2026-10-25T14:00:00");
const day = (iso: string) => isoDay(iso)!;

describe("customRange", () => {
  test("only Custom draws a range", () => {
    expect(customRange("week", "2026-09-01", "2026-09-30", now)).toBeNull();
    expect(customRange(undefined, undefined, undefined, now)).toBeNull();
  });
  test("Custom draws the URL's dates, or the last 30 days without them", () => {
    expect(customRange("custom", "2026-09-01", "2026-09-30", now)).toEqual({ from: day("2026-09-01"), to: day("2026-09-30") });
    expect(customRange("custom", undefined, undefined, now)).toEqual({ from: day("2026-09-26"), to: day("2026-10-25") });
    expect(customRange("custom", "nonsense", "2026-09-30", now)).toEqual({ from: day("2026-09-26"), to: day("2026-10-25") });
  });
});

describe("reachesBefore and clipSpan", () => {
  const windowFrom = ist("2026-07-27T14:00:00");
  test("a span starting before the kept window, with tracking older than it, is partial", () => {
    expect(reachesBefore({ from: ist("2026-06-01T00:00:00"), to: Infinity }, windowFrom, null)).toBe(true);
    expect(reachesBefore({ from: ist("2026-06-01T00:00:00"), to: Infinity }, windowFrom, ist("2026-01-01T00:00:00"))).toBe(true);
  });
  test("not when tracking began inside the window, or the span does", () => {
    expect(reachesBefore({ from: ist("2026-06-01T00:00:00"), to: Infinity }, windowFrom, ist("2026-08-01T00:00:00"))).toBe(false);
    expect(reachesBefore({ from: ist("2026-09-01T00:00:00"), to: Infinity }, windowFrom, null)).toBe(false);
  });
  test("clipSpan keeps to the window and to now", () => {
    expect(clipSpan({ from: ist("2026-06-01T00:00:00"), to: Infinity }, windowFrom, now)).toEqual({ from: windowFrom, to: now });
    expect(clipSpan({ from: ist("2026-09-01T00:00:00"), to: ist("2026-10-01T00:00:00") }, windowFrom, now)).toEqual({
      from: ist("2026-09-01T00:00:00"),
      to: ist("2026-10-01T00:00:00"),
    });
  });
});

describe("period links", () => {
  test("Custom carries its dates; without them the page opens on 30 days", () => {
    expect(statsHref("charging", "custom", { from: "2026-09-01", to: "2026-09-30" })).toBe("/stats/charging?period=custom&from=2026-09-01&to=2026-09-30");
    expect(statsHref("battery", "custom")).toBe("/stats/battery?period=custom");
  });
  test("each page's default stays out of the URL", () => {
    expect(statsHref("driving", "week")).toBe("/stats/driving");
    expect(statsHref("driving", "year", { from: "2026-09-01", to: "2026-09-30" })).toBe("/stats/driving?period=year");
    expect(periodQuery("month", null, UPDATE_PERIODS)).toBe("");
    expect(periodQuery("year", null, UPDATE_PERIODS)).toBe("?period=year");
  });
  test("urlRange needs two dates", () => {
    expect(urlRange("2026-09-01", "2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(urlRange("2026-09-01", null)).toBeNull();
    expect(urlRange("2026-09-01", "30/09/2026")).toBeNull();
  });
  test("customScope gives the drawn range and today as date inputs hold them", () => {
    expect(customScope({ from: day("2026-09-01"), to: day("2026-09-30") }, now)).toEqual({ range: { from: "2026-09-01", to: "2026-09-30" }, today: "2026-10-25" });
    expect(customScope(null, now)).toEqual({ range: null, today: "2026-10-25" });
  });
});

describe("periodFrames", () => {
  const empty: DrivingPeriod = { current: { km: 0, whPerKm: null, kwh: null, regenKwh: null }, previous: null, bars: [] };
  const figures = {
    periods: { day: empty, week: empty, month: empty, year: empty, all: empty },
    since: null,
    odometerKm: null,
  } satisfies DrivingFigures;
  test("every period, and Custom only with a range", () => {
    expect(periodFrames(figures, null, [], now).map((f) => f.key)).toEqual(["day", "week", "month", "year", "all"]);
    const range = { from: day("2026-09-01"), to: day("2026-09-30") };
    const frames = periodFrames(figures, { range, frame: rangeTimeframe(range, now), driving: null }, [], now);
    expect(frames.map((f) => f.key)).toEqual(["day", "week", "month", "year", "all", "custom"]);
    expect(frames.at(-1)!.driving).toBeNull();
    expect(frames.at(-1)!.frame.title).toBe(rangeTimeframe(range, now).title);
  });
});
