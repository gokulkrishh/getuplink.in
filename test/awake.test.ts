import { describe, expect, test } from "bun:test";
import { awakeDays, runLabel } from "@/lib/awake";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("runLabel", () => {
  test("one reading is a time, not a length", () => {
    expect(runLabel({ state: "online", start: ist("2026-10-20T08:00:00"), end: ist("2026-10-20T08:15:00"), seen: [ist("2026-10-20T08:12:00")] })).toBe("Online · 8:12 AM");
  });
  test("steady readings give a length, both times in full", () => {
    const seen = ["19:12", "19:17", "19:25", "19:33", "19:40"].map((t) => ist(`2026-10-20T${t}:00`));
    expect(runLabel({ state: "online", start: ist("2026-10-20T19:00:00"), end: ist("2026-10-20T19:45:00"), seen })).toBe("Online · 7:12 PM to 7:40 PM · 28 min");
  });
  test("a gap wider than 10 minutes splits the times and drops the length", () => {
    const seen = ["08:02", "08:06", "08:29"].map((t) => ist(`2026-10-20T${t}:00`));
    expect(runLabel({ state: "online", start: ist("2026-10-20T08:00:00"), end: ist("2026-10-20T08:30:00"), seen })).toBe("Online · 8:02 AM to 8:06 AM, 8:29 AM");
  });
  test("a check is the time it ran", () => {
    expect(runLabel({ state: "asleep", start: ist("2026-10-20T02:00:00"), end: ist("2026-10-20T02:15:00"), seen: [ist("2026-10-20T02:00:40")] })).toBe("Asleep · 2:00 AM");
  });
  test("no data keeps its span, across AM and PM", () => {
    expect(runLabel({ state: "unknown", start: ist("2026-10-20T00:00:00"), end: ist("2026-10-20T12:00:00"), seen: [] })).toBe("No data · 12:00 AM to 12:00 PM");
    expect(runLabel({ state: "unknown", start: ist("2026-10-20T11:30:00"), end: ist("2026-10-20T18:05:00"), seen: [] })).toBe("No data · 11:30 AM to 6:05 PM");
  });
});

describe("awakeDays", () => {
  const now = ist("2026-10-20T12:00:00");
  const runs = (readings: number[], polls: { at: number; state: string }[]) => awakeDays(readings, polls, now, 1)[0].runs.filter((r) => r.state !== "unknown");

  test("a reading marks only its own 15 minutes", () => {
    expect(runs([ist("2026-10-20T08:12:00")], [])).toEqual([
      { state: "online", start: ist("2026-10-20T08:00:00"), end: ist("2026-10-20T08:15:00"), seen: [ist("2026-10-20T08:12:00")] },
    ]);
  });
  test("an asleep check is not stretched to the next reading", () => {
    expect(runs([ist("2026-10-20T08:12:00")], [{ at: ist("2026-10-20T06:00:40"), state: "asleep" }]).map((r) => [r.state, r.end - r.start])).toEqual([
      ["asleep", 15 * 60_000],
      ["online", 15 * 60_000],
    ]);
  });
  test("online wins a slot a check found asleep", () => {
    expect(runs([ist("2026-10-20T06:05:00")], [{ at: ist("2026-10-20T06:00:40"), state: "asleep" }]).map((r) => r.state)).toEqual(["online"]);
  });
});
