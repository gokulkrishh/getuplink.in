import { describe, expect, test } from "bun:test";
import { timeframes } from "@/lib/frames";
import { backTo, cappedFrom, overlapping, serials, weeksIn, within } from "@/lib/kept";
import { periodSpan, rangeTimeframe } from "@/lib/periods";
import { istDay } from "@/lib/telemetry-derive";

const DAY = 86_400_000;
// 25 Oct 2026, noon IST.
const NOW = Date.UTC(2026, 9, 25, 6, 30);
const at = (month: number, day: number) => Date.UTC(2026, month, day, 6, 30);

describe("backTo", () => {
  test("names the first item held when the span starts before it", () => {
    expect(backTo(periodSpan("year", NOW), at(8, 25), "Readings")).toMatch(/^Readings go back to 25 Sept?\.$/);
    expect(backTo(periodSpan("all", NOW), at(8, 25), "Stretches")).toMatch(/^Stretches go back to 25 Sept?\.$/);
  });
  test("says nothing when the span starts after the first item", () => {
    expect(backTo(periodSpan("week", NOW), at(8, 25), "Readings")).toBeNull();
    expect(backTo(periodSpan("day", NOW), at(9, 1), "Readings")).toBeNull();
  });
  test("says nothing when nothing is held", () => {
    expect(backTo(periodSpan("all", NOW), null, "Readings")).toBeNull();
    expect(backTo(periodSpan("all", NOW), undefined, "Readings")).toBeNull();
    expect(backTo(periodSpan("all", NOW), Infinity, "Readings")).toBeNull();
  });
});

describe("within and overlapping", () => {
  const span = { from: at(9, 20), to: at(9, 23) };
  test("within keeps what is dated in the span, end excluded", () => {
    expect(within([at(9, 19), at(9, 20), at(9, 22), at(9, 23)], span, (t) => t)).toEqual([at(9, 20), at(9, 22)]);
  });
  test("overlapping keeps stretches that cross either end", () => {
    const stretches = [
      { start: at(9, 18), end: at(9, 19) },
      { start: at(9, 19), end: at(9, 21) },
      { start: at(9, 22), end: at(9, 24) },
      { start: at(9, 23), end: at(9, 24) },
    ];
    expect(overlapping(stretches, span, (s) => s.start, (s) => s.end)).toEqual([stretches[1], stretches[2]]);
  });
  test("weeksIn keeps a week that started before the span but runs into it", () => {
    const weeks = [{ weekStart: at(9, 5) }, { weekStart: at(9, 12) }, { weekStart: at(9, 19) }];
    expect(weeksIn(weeks, { from: at(9, 15), to: Infinity })).toEqual([weeks[1], weeks[2]]);
    expect(weeksIn(weeks, periodSpan("all", NOW))).toEqual(weeks);
  });
});

describe("cappedFrom", () => {
  const newestFirst = [at(9, 24), at(9, 20), at(9, 10), at(9, 1)];
  test("the oldest held when the cap cut some off", () => {
    expect(cappedFrom(newestFirst, 2, (t) => t)).toBe(at(9, 20));
  });
  test("null when every item is held", () => {
    expect(cappedFrom(newestFirst, 4, (t) => t)).toBeNull();
    expect(cappedFrom([], 8, (t) => t)).toBeNull();
  });
});

describe("serials", () => {
  test("count from the oldest, so the newest has the highest", () => {
    const map = serials(["c", "b", "a"], (k) => k);
    expect([map.get("a"), map.get("b"), map.get("c")]).toEqual([1, 2, 3]);
  });
});

describe("timeframes", () => {
  test("every period, then the range when there is one", () => {
    expect(timeframes(null, NOW).map((f) => f.key)).toEqual(["day", "week", "month", "year", "all"]);
    const today = istDay(NOW);
    const custom = rangeTimeframe({ from: today - 9, to: today }, NOW);
    const frames = timeframes(custom, NOW);
    expect(frames.map((f) => f.key)).toEqual(["day", "week", "month", "year", "all", "custom"]);
    expect(frames.at(-1)?.frame).toBe(custom);
    expect(frames.every((f) => f.driving === null)).toBe(true);
    expect(frames[1].frame.span.from).toBe(periodSpan("week", NOW).from);
    expect(custom.span.from).toBeLessThan(NOW - 9 * DAY);
  });
});
