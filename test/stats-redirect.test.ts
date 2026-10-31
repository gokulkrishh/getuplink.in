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
  test("Battery keeps the period, Custom with its dates", () => {
    expect(target("view=battery&period=month")).toBe("/stats/battery?period=month");
    expect(target("view=battery&period=day")).toBe("/stats/battery?period=day");
    expect(target("view=battery&period=week")).toBe("/stats/battery");
    expect(target("view=battery&period=custom&from=2026-09-01&to=2026-09-30")).toBe("/stats/battery?period=custom&from=2026-09-01&to=2026-09-30");
  });
  test("no view, or one that doesn't exist, opens Driving", () => {
    expect(target("")).toBe("/stats/driving");
    expect(target("view=nonsense&period=year")).toBe("/stats/driving?period=year");
  });
  test("Week, what Stats opens on, and unknown periods stay out of the URL", () => {
    expect(target("view=driving&period=week")).toBe("/stats/driving");
    expect(target("view=driving&period=day")).toBe("/stats/driving?period=day");
    expect(target("view=driving&period=month")).toBe("/stats/driving?period=month");
    expect(target("view=driving&period=decade")).toBe("/stats/driving");
  });
  test("Charging opens on Month: Month stays out of the URL, Week carries over", () => {
    expect(target("view=charging")).toBe("/stats/charging");
    expect(target("view=charging&period=month")).toBe("/stats/charging");
    expect(target("view=charging&period=week")).toBe("/stats/charging?period=week");
    expect(target("view=charging&period=decade")).toBe("/stats/charging");
  });
  test("Custom carries its dates to the page", () => {
    expect(target("view=charging&period=custom&from=2026-09-01&to=2026-09-30")).toBe("/stats/charging?period=custom&from=2026-09-01&to=2026-09-30");
    expect(target("view=updates&period=custom&from=2026-01-01&to=2026-06-30")).toBe("/updates?period=custom&from=2026-01-01&to=2026-06-30");
  });
  test("without valid dates Custom stays, and the page opens on the last 30 days", () => {
    expect(target("view=driving&period=custom")).toBe("/stats/driving?period=custom");
    expect(target("view=battery&period=custom&from=2026-09-01&to=soon")).toBe("/stats/battery?period=custom");
    expect(target("view=updates&period=custom")).toBe("/updates?period=custom");
  });
});
