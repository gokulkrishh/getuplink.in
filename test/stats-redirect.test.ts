import { describe, expect, test } from "bun:test";
import { statsRedirect } from "@/lib/stats-redirect";

const target = (query: string) => statsRedirect(new URLSearchParams(query));

describe("statsRedirect", () => {
  test("update stats moved to /updates", () => {
    expect(target("view=updates")).toBe("/updates");
  });
  test("the period carries over where /updates offers it", () => {
    expect(target("view=updates&period=year")).toBe("/updates?period=year");
    expect(target("view=updates&period=all")).toBe("/updates?period=all");
  });
  test("Month is the default, so it stays out of the URL", () => {
    expect(target("view=updates&period=month")).toBe("/updates");
  });
  test("periods /updates doesn't offer fall back to Month", () => {
    expect(target("view=updates&period=6m")).toBe("/updates");
    expect(target("view=updates&period=week")).toBe("/updates");
    expect(target("view=updates&period=nonsense")).toBe("/updates");
  });
  test("each tab has its own page now, with the period", () => {
    expect(target("view=driving&period=year")).toBe("/stats/driving?period=year");
    expect(target("view=battery")).toBe("/stats/battery");
    expect(target("view=charging&period=all")).toBe("/stats/charging?period=all");
  });
  test("no view, or one that doesn't exist, opens Driving", () => {
    expect(target("")).toBe("/stats/driving");
    expect(target("view=nonsense&period=year")).toBe("/stats/driving?period=year");
  });
  test("Week, the default, and unknown periods stay out of the URL", () => {
    expect(target("view=driving&period=week")).toBe("/stats/driving");
    expect(target("view=driving&period=month")).toBe("/stats/driving?period=month");
    expect(target("view=driving&period=decade")).toBe("/stats/driving");
  });
});
