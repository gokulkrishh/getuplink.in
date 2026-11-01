import { describe, expect, test } from "bun:test";
import { customScope, datesNote, PAGE_PERIODS, parsePeriod, periodQuery, pickerLine, statsHref, unreadableDates, urlRange, viewPeriods } from "@/components/stats/periods";
import { periodFrames } from "@/lib/frames";
import type { DrivingFigures, DrivingPeriod } from "@/lib/driving-figures";
import { clipSpan, customQuery, customRange, isoDay, reachesBefore, rangeTimeframe, recentSpan } from "@/lib/periods";
import { updatesIn } from "@/components/updates/update-stats";

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

describe("customQuery", () => {
  test("only Custom passes its dates on, as plain strings", () => {
    expect(customQuery({ period: "custom", from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(customQuery({ period: "custom", from: ["a", "b"] })).toEqual({ from: null, to: null });
    expect(customQuery({ period: "week", from: "2026-09-01", to: "2026-09-30" })).toBeNull();
  });
});

describe("updatesIn", () => {
  const rows = ["2026-08-31T20:00:00", "2026-09-01T09:00:00", "2026-09-30T23:00:00", "2026-10-02T10:00:00"].map((t) => ({
    detected_at: new Date(ist(t)).toISOString(),
    available_at: null,
  }));
  test("a period counts by IST month", () => {
    expect(updatesIn(rows, "month", now)).toBe(1);
    expect(updatesIn(rows, "year", now)).toBe(4);
  });
  test("a range counts by the day each update was seen", () => {
    const sept = rangeTimeframe({ from: day("2026-09-01"), to: day("2026-09-30") }, now);
    expect(updatesIn(rows, sept, now)).toBe(2);
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
  test("recentSpan keeps the newest days only", () => {
    expect(recentSpan({ from: ist("2026-06-01T00:00:00"), to: Infinity }, windowFrom, 30, now)).toEqual({ from: now - 30 * 86_400_000, to: now });
    const sept = { from: ist("2026-09-01T00:00:00"), to: ist("2026-09-11T00:00:00") };
    expect(recentSpan(sept, windowFrom, 30, now)).toEqual(sept);
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
  test("the period each page opens on stays out of the URL: Week on Home and Stats, Month on Updates", () => {
    expect(statsHref("driving", "week")).toBe("/stats/driving");
    expect(statsHref("driving", "day")).toBe("/stats/driving?period=day");
    expect(statsHref("driving", "month")).toBe("/stats/driving?period=month");
    expect(statsHref("driving", "year", { from: "2026-09-01", to: "2026-09-30" })).toBe("/stats/driving?period=year");
    expect(periodQuery("week", null, PAGE_PERIODS.home)).toBe("");
    expect(periodQuery("day", null, PAGE_PERIODS.home)).toBe("?period=day");
    expect(periodQuery("month", null, PAGE_PERIODS.updates)).toBe("");
    expect(periodQuery("year", null, PAGE_PERIODS.updates)).toBe("?period=year");
  });
  test("a page opens on its own period when the URL names none, or one it doesn't offer", () => {
    expect(parsePeriod(undefined, PAGE_PERIODS.stats)).toBe("week");
    expect(parsePeriod("day", PAGE_PERIODS.stats)).toBe("day");
    expect(parsePeriod(undefined, PAGE_PERIODS.home)).toBe("week");
    expect(parsePeriod("week", PAGE_PERIODS.updates)).toBe("month");
    expect(parsePeriod("decade", PAGE_PERIODS.home)).toBe("week");
  });
  test("Charging opens on Month, so Month stays out of its URL and Week goes in it", () => {
    expect(viewPeriods("charging").opensOn).toBe("month");
    expect(viewPeriods("driving")).toBe(PAGE_PERIODS.stats);
    expect(statsHref("charging", "month")).toBe("/stats/charging");
    expect(statsHref("charging", "week")).toBe("/stats/charging?period=week");
    expect(statsHref("charging", "day")).toBe("/stats/charging?period=day");
    // An old link that names Week still opens on Week.
    expect(parsePeriod("week", viewPeriods("charging"))).toBe("week");
    expect(parsePeriod(undefined, viewPeriods("charging"))).toBe("month");
    expect(parsePeriod("decade", viewPeriods("charging"))).toBe("month");
  });
  test("urlRange needs two dates", () => {
    expect(urlRange("2026-09-01", "2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(urlRange("2026-09-01", null)).toBeNull();
    expect(urlRange("2026-09-01", "30/09/2026")).toBeNull();
  });
  test("unreadableDates is true only when dates are given but can't be read", () => {
    expect(unreadableDates("xx", null)).toBe(true);
    expect(unreadableDates("2026-09-01", "30/09/2026")).toBe(true);
    expect(unreadableDates("2026-09-01", null)).toBe(true);
    expect(unreadableDates(null, null)).toBe(false);
    expect(unreadableDates("", undefined)).toBe(false);
    expect(unreadableDates("2026-09-01", "2026-09-30")).toBe(false);
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

describe("a Custom page names the range it shows", () => {
  const today = "2026-10-25";
  const shown = (from: string, to: string) => ({ from, to });
  test("dates in the future: the page says which day it shows instead", () => {
    expect(datesNote("custom", "2030-01-01", "2030-02-01", shown("2026-10-25", "2026-10-25"), today)).toBe(
      "Uplink couldn't use those dates, so it shows 25 Oct.",
    );
  });
  test("dates the wrong way round: the page names the range it drew", () => {
    expect(datesNote("custom", "2026-10-20", "2026-10-01", shown("2026-10-01", "2026-10-20"), today)).toBe(
      "Uplink couldn't use those dates, so it shows 1 Oct to 20 Oct.",
    );
  });
  test("dates that can't be read open on the last 30 days, as before", () => {
    expect(datesNote("custom", "xx", "2026-10-01", shown("2026-09-26", "2026-10-25"), today)).toBe(
      "Uplink couldn't read those dates, so it shows the last 30 days.",
    );
  });
  test("no note when the page shows the dates asked for, or none were given", () => {
    expect(datesNote("custom", "2026-09-01", "2026-09-30", shown("2026-09-01", "2026-09-30"), today)).toBeNull();
    expect(datesNote("custom", null, null, shown("2026-09-26", "2026-10-25"), today)).toBeNull();
    expect(datesNote("week", "2030-01-01", "2030-02-01", null, today)).toBeNull();
  });
  test("a rejected pick says the figures are still for the range shown", () => {
    expect(pickerLine("Pick dates up to today.", shown("2026-10-01", "2026-10-20"), today)).toBe(
      "Pick dates up to today. The page still shows 1 Oct to 20 Oct.",
    );
    expect(pickerLine("Pick dates up to today.", shown("2025-12-30", "2026-01-02"), today)).toBe(
      "Pick dates up to today. The page still shows 30 Dec 2025 to 2 Jan 2026.",
    );
  });
});
