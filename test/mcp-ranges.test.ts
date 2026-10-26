import { describe, expect, test } from "bun:test";
import { dayBounds, parseInvoiceTime, parseRangeEnd, seasonsPeriod } from "@/lib/mcp-ranges";
import type { SeasonFigure } from "@/lib/seasons";

const DAY = 86_400_000;
// 26 Oct 2026, 6 PM IST.
const NOW = Date.parse("2026-10-26T18:00:00+05:30");

describe("parseInvoiceTime", () => {
  test("reads a date alone as that day's IST midnight", () => {
    expect(parseInvoiceTime("2026-10-21")).toBe(Date.parse("2026-10-21T00:00:00+05:30"));
  });

  test("reads a time without an offset as IST, and one with an offset as given", () => {
    expect(parseInvoiceTime("2026-10-21T19:10")).toBe(Date.parse("2026-10-21T19:10:00+05:30"));
    expect(parseInvoiceTime("2026-10-21T13:40:00Z")).toBe(Date.parse("2026-10-21T13:40:00Z"));
  });
});

describe("parseRangeEnd", () => {
  test("a date alone takes in the whole day", () => {
    expect(parseRangeEnd("2026-10-21")).toBe(Date.parse("2026-10-22T00:00:00+05:30"));
  });

  test("a time ends at that time, with no day added", () => {
    expect(parseRangeEnd("2026-10-21T19:10")).toBe(Date.parse("2026-10-21T19:10:00+05:30"));
  });
});

describe("dayBounds", () => {
  test("today runs from IST midnight to the next", () => {
    const b = dayBounds("2026-10-26", NOW);
    expect(b).toEqual({ day: Date.parse("2026-10-26T00:00:00Z") / DAY, start: Date.parse("2026-10-26T00:00:00+05:30"), end: Date.parse("2026-10-27T00:00:00+05:30"), days: 1 });
  });

  test("an earlier day counts the days back to it", () => {
    const b = dayBounds("2026-10-20", NOW);
    expect("days" in b && b.days).toBe(7);
  });

  test("a future date is an error, not today's timeline", () => {
    expect(dayBounds("2026-10-27", NOW)).toHaveProperty("error");
  });

  test("a date older than the days kept is an error", () => {
    expect(dayBounds("2026-01-01", NOW)).toHaveProperty("error");
    expect(dayBounds("2026-07-29", NOW)).not.toHaveProperty("error");
  });

  test("a date that would roll over is an error", () => {
    expect(dayBounds("2026-02-30", NOW)).toHaveProperty("error");
  });
});

describe("seasonsPeriod", () => {
  const season = (over: Partial<SeasonFigure>): SeasonFigure => ({ season: "winter", start: 0, first: 0, last: 0, current: false, whPerKm: 150, kwh: 10, km: 70, ...over });
  // Month indexes: year * 12 + month (0 is January).
  const month = (year: number, m: number) => year * 12 + m;

  test("spans the oldest month to the newest, not the last 30 days", () => {
    const seasons = [
      season({ season: "winter", first: month(2025, 11), last: month(2026, 1) }),
      season({ season: "postMonsoon", first: month(2026, 9), last: month(2026, 9), current: true }),
    ];
    expect(seasonsPeriod(seasons)).toBe("Dec 2025 to Oct 2026 so far");
  });

  test("is null with no seasons", () => {
    expect(seasonsPeriod([])).toBeNull();
  });
});
