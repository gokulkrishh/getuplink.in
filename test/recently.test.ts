import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { RECENT_MS, recentlyLines } from "@/lib/recently";

const at = (s: string) => Date.parse(`${s}+05:30`);
const now = at("2026-10-27T12:00:00");
const drive = (start: string, end: string, km: number): Drive => ({ start: at(start), end: at(end), km, kwh: null, whPerKm: null, startLevel: null, endLevel: null });
const charge = (id: number, ended: string | null, from: number | null, to: number | null, kwh: number | null = null) => ({
  id, started_at: new Date(at("2026-10-26T17:00:00")).toISOString(), ended_at: ended && new Date(at(ended)).toISOString(), start_level: from, end_level: to, energy_added_kwh: kwh,
});

describe("recentlyLines", () => {
  test("names the newest drive and the newest finished charge, each with its page", () => {
    const items = recentlyLines(
      [drive("2026-10-27T08:30:00", "2026-10-27T08:52:00", 18.4), drive("2026-10-26T09:00:00", "2026-10-26T09:20:00", 5)],
      [charge(9, null, 40, null), charge(7, "2026-10-26T18:10:00", 50, 80)],
      now,
    );
    expect(items).toEqual([
      { kind: "drive", figure: "18.4 km", when: "8:30\u00a0AM to 8:52\u00a0AM", href: `/stats/driving/${at("2026-10-27T08:30:00")}` },
      { kind: "charge", figure: "50% to 80%", when: "Yesterday, 6:10\u00a0PM", href: "/stats/charging/7" },
    ]);
  });

  test("a drive yesterday names the day; one past midnight names only its start", () => {
    expect(recentlyLines([drive("2026-10-26T14:30:00", "2026-10-26T14:52:00", 18.4)], [], now)[0].when).toBe("Yesterday, 2:30\u00a0PM to 2:52\u00a0PM");
    expect(recentlyLines([drive("2026-10-26T23:50:00", "2026-10-27T00:20:00", 18.4)], [], now)[0].when).toBe("Yesterday, 11:50\u00a0PM");
  });

  test("names only this car's charge, not another car's on the same account", () => {
    const other = { ...charge(8, "2026-10-27T07:00:00", 20, 90), vin: "OTHER" };
    const mine = { ...charge(7, "2026-10-26T18:10:00", 50, 80), vin: "MINE" };
    expect(recentlyLines([], [other, mine], now, "MINE").map((i) => i.href)).toEqual(["/stats/charging/7"]);
  });

  test("hides what is unknown", () => {
    expect(recentlyLines([], [], now)).toEqual([]);
    expect(recentlyLines([drive("2026-10-27T08:30:00", "2026-10-27T08:31:00", 0.01)], [], now)).toEqual([]);
  });

  test("shows only what ended in the last 24 hours: 23 h 59 min shows, 24 h 1 min hides", () => {
    const min = 60_000;
    const driveEnding = (ms: number): Drive => ({ start: now - ms - 20 * min, end: now - ms, km: 10, kwh: null, whPerKm: null, startLevel: null, endLevel: null });
    const chargeEnding = (ms: number) => ({ ...charge(3, null, 50, 80), ended_at: new Date(now - ms).toISOString() });
    expect(recentlyLines([driveEnding(RECENT_MS - min)], [chargeEnding(RECENT_MS - min)], now).map((i) => i.kind)).toEqual(["drive", "charge"]);
    expect(recentlyLines([driveEnding(RECENT_MS + min)], [chargeEnding(RECENT_MS + min)], now)).toEqual([]);
    // One recent, one not: only the recent one.
    expect(recentlyLines([driveEnding(RECENT_MS + min)], [chargeEnding(60 * min)], now).map((i) => i.kind)).toEqual(["charge"]);
  });

  test("a charge without levels says the energy, else no figure", () => {
    expect(recentlyLines([], [charge(2, "2026-10-27T07:00:00", null, null, 12.4)], now)[0]).toMatchObject({ figure: "12.4 kWh", when: "7:00\u00a0AM" });
    expect(recentlyLines([], [charge(2, "2026-10-27T07:00:00", null, null)], now)[0].figure).toBeNull();
  });
});
