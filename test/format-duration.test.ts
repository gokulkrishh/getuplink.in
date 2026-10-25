import { describe, expect, test } from "bun:test";
import { formatAgo, formatDuration, formatHour, formatInstallLeft, formatPower } from "@/lib/format";

describe("formatPower", () => {
  test("watts under 1 kW, kW from there", () => {
    expect(formatPower(24.4)).toBe("24 W");
    expect(formatPower(4.46)).toBe("4.5 W");
    expect(formatPower(999.7)).toBe("1.0 kW");
    expect(formatPower(1240)).toBe("1.2 kW");
  });
});

describe("formatDuration", () => {
  test("minutes, then hours, then days", () => {
    expect(formatDuration(40 * 60)).toBe("40 min");
    expect(formatDuration(150 * 60)).toBe("2 h 30 min");
    expect(formatDuration(38 * 3600 + 44 * 60)).toBe("1 day 14 h");
    expect(formatDuration(48 * 3600 + 10 * 60)).toBe("2 days");
  });
});

describe("formatAgo", () => {
  const now = Date.parse("2026-10-23T10:00:00+05:30");
  test("relative up to a week, then the date", () => {
    expect(formatAgo(now - 5 * 3600_000, now)).toBe("5 hours ago");
    expect(formatAgo(now - 30 * 3600_000, now)).toBe("yesterday");
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(formatAgo(now - 9 * 86_400_000, now)).toBe("14 Oct, 10:00 AM IST");
  });
});

describe("formatInstallLeft", () => {
  test("shows the share of Tesla's whole-install estimate still to go", () => {
    // 2026.38.3.2 at 30% of a 40 min install: 28 min, shown as the Tesla app does.
    expect(formatInstallLeft(40 * 60, 30)).toBe("About 30 min left");
    expect(formatInstallLeft(40 * 60, 1)).toBe("About 40 min left");
    expect(formatInstallLeft(40 * 60, 80)).toBe("About 8 min left");
    expect(formatInstallLeft(40 * 60, 100)).toBe("Almost done");
  });
});

describe("formatHour", () => {
  test("an hour as the app writes times, never 6a", () => {
    expect([0, 3, 6, 11, 12, 15, 21, 24].map(formatHour)).toEqual(["12 AM", "3 AM", "6 AM", "11 AM", "12 PM", "3 PM", "9 PM", "12 AM"]);
  });
});
