import { describe, expect, test } from "bun:test";

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
