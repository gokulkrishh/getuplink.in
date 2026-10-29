import { describe, expect, test } from "bun:test";
import { barOpens } from "@/components/stats/bar-parts";
import { chargeStops, driveStops } from "@/lib/bar-stops";
import type { Drive } from "@/lib/drives";
import type { SlotDays } from "@/lib/periods";

// Where a day's bar leads: its one drive or charge, else the day's list.

const ist = (iso: string) => Date.parse(`${iso}+05:30`);
const day = (iso: string): SlotDays => ({ kind: "day", from: iso, to: iso, title: "Tue, 28 Oct" });
const drive = (start: string, end: string, km = 12): Drive => ({ start: ist(start), end: ist(end), km, kwh: 2, whPerKm: 150, startLevel: 80, endLevel: 78 });
const now = ist("2026-10-29T10:00:00");

describe("a day's bar", () => {
  test("one drive opens that drive", () => {
    const stops = driveStops([drive("2026-10-28T09:00:00", "2026-10-28T09:30:00")], now);
    expect(barOpens(day("2026-10-28"), "driving", stops)).toEqual({ href: `/stats/driving/${ist("2026-10-28T09:00:00")}`, label: "Open drive" });
  });
  test("several drives open the day's list, saying so", () => {
    const stops = driveStops([drive("2026-10-28T09:00:00", "2026-10-28T09:30:00"), drive("2026-10-28T18:00:00", "2026-10-28T18:40:00")], now);
    expect(barOpens(day("2026-10-28"), "driving", stops)).toEqual({ href: "/stats/driving?period=custom&from=2026-10-28&to=2026-10-28", label: "Open 28 Oct's drives" });
  });
  test("drives on other days, and drives that moved nothing, don't count", () => {
    const stops = driveStops([drive("2026-10-27T09:00:00", "2026-10-27T09:30:00"), drive("2026-10-28T09:00:00", "2026-10-28T09:30:00"), drive("2026-10-28T12:00:00", "2026-10-28T12:02:00", 0)], now);
    expect(barOpens(day("2026-10-28"), "driving", stops)?.label).toBe("Open drive");
  });
  test("a drive across midnight is the one drive of both days", () => {
    const stops = driveStops([drive("2026-10-27T23:50:00", "2026-10-28T00:20:00")], now);
    expect(barOpens(day("2026-10-27"), "driving", stops)?.label).toBe("Open drive");
    expect(barOpens(day("2026-10-28"), "driving", stops)?.label).toBe("Open drive");
  });
  test("a day before the drives are kept is a list: the one drive known may not be the only one", () => {
    const old = ist("2026-06-01T09:00:00");
    const stops = driveStops([drive("2026-06-01T09:00:00", "2026-06-01T09:30:00")], now);
    expect(old).toBeLessThan(stops.from!);
    expect(barOpens(day("2026-06-01"), "driving", stops)?.label).toBe("Open 1 Jun's drives");
  });
  test("one charge opens that charge; several open the list; a charge with no page of its own opens the list", () => {
    const one = chargeStops([{ started_at: "2026-10-28T03:30:00.000Z", stream: { id: 41 } }]);
    expect(barOpens(day("2026-10-28"), "charging", one)).toEqual({ href: "/stats/charging/41", label: "Open charge" });
    const two = chargeStops([
      { started_at: "2026-10-28T03:30:00.000Z", stream: { id: 41 } },
      { started_at: "2026-10-28T12:30:00.000Z", stream: { id: 42 } },
    ]);
    expect(barOpens(day("2026-10-28"), "charging", two)).toEqual({ href: "/stats/charging?period=custom&from=2026-10-28&to=2026-10-28", label: "Open 28 Oct's charges" });
    const bare = chargeStops([{ started_at: "2026-10-28T03:30:00.000Z", stream: null }]);
    expect(barOpens(day("2026-10-28"), "charging", bare)?.href).toBe("/stats/charging?period=custom&from=2026-10-28&to=2026-10-28");
  });
  test("a charge counts on the IST day it started", () => {
    // 18:40 UTC on the 27th is 00:10 on the 28th in India.
    const stops = chargeStops([{ started_at: "2026-10-27T18:40:00.000Z", stream: { id: 7 } }]);
    expect(barOpens(day("2026-10-28"), "charging", stops)?.href).toBe("/stats/charging/7");
  });
  test("without stops it is the day's list, named for its page", () => {
    expect(barOpens(day("2026-10-28"))?.label).toBe("Open 28 Oct's drives");
    expect(barOpens(day("2026-10-28"), "charging")?.label).toBe("Open 28 Oct's charges");
  });
});

describe("a month's or year's bar", () => {
  test("keeps opening its days, named by the month or year", () => {
    expect(barOpens({ kind: "month", from: "2026-09-01", to: "2026-09-30", title: "Sept 2026" }, "charging", chargeStops([]))).toEqual({
      href: "/stats/charging?period=custom&from=2026-09-01&to=2026-09-30",
      label: "Open Sept 2026",
    });
    expect(barOpens({ kind: "year", from: "2026-01-01", to: "2026-10-26", title: "2026" }, "driving")).toEqual({ href: "/stats/driving?period=custom&from=2026-01-01&to=2026-10-26", label: "Open 2026" });
    expect(barOpens({ kind: "month", from: "2026-09-01", to: "2026-09-30", title: "Sep 2026" })).toBeNull();
    expect(barOpens(undefined, "driving")).toBeNull();
  });
});
