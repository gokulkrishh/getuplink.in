import { describe, expect, test } from "bun:test";
import { dayStrips } from "@/lib/day-timeline";

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
