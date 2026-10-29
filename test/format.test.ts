import { describe, expect, test } from "bun:test";
import { formatSince } from "@/lib/format";

describe("formatDurationExact", () => {
  test("keeps the seconds", async () => {
    const { formatDurationExact } = await import("@/lib/format");
    expect(formatDurationExact(29 * 60 + 58)).toBe("29 min 58 s");
    expect(formatDurationExact(2 * 3600 + 35 * 60 + 12)).toBe("2 h 35 min 12 s");
    expect(formatDurationExact(3600 + 4)).toBe("1 h 0 min 4 s");
    expect(formatDurationExact(42)).toBe("42 s");
    expect(formatDurationExact(22 * 60)).toBe("22 min");
  });
});

describe("formatSince", () => {
  // Thursday 29 Oct 2026, 11:30 AM IST.
  const now = Date.parse("2026-10-29T06:00:00Z");

  test("today reads the time, yesterday its word, this week the weekday, older the date (IST)", () => {
    expect(formatSince("2026-10-29T01:45:00Z", now)).toBe("since 7:15 AM");
    expect(formatSince("2026-10-28T10:00:00Z", now)).toBe("since yesterday");
    expect(formatSince("2026-10-27T10:00:00Z", now)).toBe("since Tuesday");
    expect(formatSince("2026-10-23T10:00:00Z", now)).toBe("since Friday");
    expect(formatSince("2026-10-22T10:00:00Z", now)).toBe("since 22 Oct");
  });
});
