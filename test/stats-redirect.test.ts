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
  test("other views stay on /stats", () => {
    expect(target("")).toBeNull();
    expect(target("view=driving&period=year")).toBeNull();
  });
});
