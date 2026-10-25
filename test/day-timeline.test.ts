import { describe, expect, test } from "bun:test";
import { dayStrips, stripsBetween } from "@/lib/day-timeline";

const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("dayStrips", () => {
  const now = ist("2026-10-23T14:00:00");
  const [yesterday, today] = dayStrips(
    2,
    {
      driving: [{ start: ist("2026-10-23T10:54:00"), end: ist("2026-10-23T12:09:00") }],
      charging: [{ start: ist("2026-10-22T20:00:00"), end: ist("2026-10-22T22:00:00") }],
      asleep: [{ start: ist("2026-10-23T02:00:00"), end: ist("2026-10-23T02:15:00") }],
    },
    ist("2026-10-22T19:19:00"),
    now,
  );
  test("before tracking is unknown, then parked, with charging painted over", () => {
    expect(yesterday.segments.map((s) => s.kind)).toEqual(["unknown", "parked", "charging", "parked"]);
  });
  test("today runs to now, driving and asleep over parked", () => {
    expect(today.segments.map((s) => s.kind)).toEqual(["parked", "asleep", "parked", "driving", "parked"]);
    expect(today.segments.at(-1)!.end).toBe(now);
  });
});

describe("stripsBetween", () => {
  const now = ist("2026-10-23T14:00:00");
  const day = (local: string) => Date.parse(`${local}T00:00:00Z`) / 86_400_000;
  const none = { driving: [], charging: [], asleep: [] };
  test("the days of a range, oldest first, none after today", () => {
    const strips = stripsBetween(day("2026-10-20"), day("2026-10-30"), none, null, now);
    expect(strips.map((d) => d.day)).toEqual([day("2026-10-20"), day("2026-10-21"), day("2026-10-22"), day("2026-10-23")]);
    expect(strips[0].start).toBe(ist("2026-10-20T00:00:00"));
  });
  test("a range that ends before it starts has no days", () => {
    expect(stripsBetween(day("2026-10-24"), day("2026-10-30"), none, null, now)).toEqual([]);
  });
  test("dayStrips is the last days of the same", () => {
    expect(dayStrips(3, none, null, now)).toEqual(stripsBetween(day("2026-10-21"), day("2026-10-23"), none, null, now));
  });
});
