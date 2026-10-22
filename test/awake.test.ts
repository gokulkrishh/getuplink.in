import { describe, expect, test } from "bun:test";
import { runLabel } from "@/lib/awake";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("runLabel", () => {
  test("says the shared AM or PM once", () => {
    expect(runLabel({ state: "online", start: ist("2026-10-20T19:12:00"), end: ist("2026-10-20T19:40:00") })).toBe("Online · 7:12–7:40 PM · 28 min");
  });
  test("keeps both when the run spans AM and PM", () => {
    expect(runLabel({ state: "asleep", start: ist("2026-10-20T11:30:00"), end: ist("2026-10-20T18:05:00") })).toBe("Asleep · 11:30 AM–6:05 PM · 6 h 35 min");
    expect(runLabel({ state: "unknown", start: ist("2026-10-20T00:00:00"), end: ist("2026-10-20T12:00:00") })).toBe("No data · 12:00 AM–12:00 PM · 12 h");
  });
  test("a run to midnight ends at 12:00 AM", () => {
    expect(runLabel({ state: "asleep", start: ist("2026-10-20T23:30:00"), end: ist("2026-10-21T00:00:00") })).toBe("Asleep · 11:30 PM–12:00 AM · 30 min");
  });
});
