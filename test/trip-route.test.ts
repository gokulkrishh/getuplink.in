import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { fixes, MOVING_MS, PARKED_AFTER_MS, PARKED_BEFORE_MS, tripEnd } from "@/lib/location";
import { tripRoute } from "@/lib/trip-route";
import { groupTrips } from "@/lib/trips";

const MIN = 60_000;
const t0 = Date.parse("2026-10-23T10:54:00+05:30");
const leg = (from: number, to: number): Drive => ({ start: t0 + from * MIN, end: t0 + to * MIN, km: 1, kwh: 0.2, whPerKm: null, startLevel: 60, endLevel: 59 });
const at = (m: number) => new Date(t0 + m * MIN).toISOString();

describe("tripRoute", () => {
  const [trip] = groupTrips([leg(0, 5), leg(25, 30)]);
  const readings = [
    { at: at(0), value: { latitude: 12.93, longitude: 77.62 } },
    { at: at(3), value: { latitude: 12.94, longitude: 77.63 } },
    { at: at(5), value: { latitude: 12.95, longitude: 77.64 } },
    { at: at(15), value: { latitude: 12.95, longitude: 77.64 } }, // parked: not on the route
    { at: at(27), value: { lat: 12.97, lng: 77.66 } },
    { at: at(30), value: { latitude: 12.98, longitude: 77.67 } },
    { at: at(31), value: { latitude: 0, longitude: 0 } }, // no fix
  ];
  test("the route only while driving, from either value shape", () => {
    const { route } = tripRoute(trip, readings);
    expect(route.map((p) => p.lat)).toEqual([12.93, 12.94, 12.95, 12.97, 12.98]);
  });
  test("pins for the start, the stop and the end", () => {
    const { pins } = tripRoute(trip, readings);
    expect(pins.map((p) => p.kind)).toEqual(["start", "stop", "end"]);
    expect(pins[1].label).toBe("Stop 1 · 10:59 AM to 11:19 AM, 20 min");
  });
  test("no location readings, no route or pins", () => {
    expect(tripRoute(trip, [])).toEqual({ route: [], pins: [] });
  });
});

// The one rule the trip page's pins, the trips list's names and the parked places share.
describe("tripEnd", () => {
  const m = t0;
  const fix = (sec: number, tag: string) => ({ t: m + sec * 1000, tag });
  const pick = (fixes: { t: number; tag: string }[], side: "start" | "end") => tripEnd(fixes, m, side)?.tag ?? null;
  test("an end: the first fix after it within 10 minutes, else the last before it within a minute", () => {
    expect(pick([fix(-5, "moving"), fix(120, "parked")], "end")).toBe("parked");
    expect(pick([fix(-5, "moving"), fix(601, "next drive")], "end")).toBe("moving");
    expect(pick([fix(-61, "moving")], "end")).toBeNull();
    expect(pick([fix(0, "at"), fix(30, "later")], "end")).toBe("at");
    expect(PARKED_AFTER_MS).toBe(10 * MIN);
    expect(MOVING_MS).toBe(60_000);
  });
  test("a start: the last fix before it within 30 minutes, else the first after it within a minute", () => {
    expect(pick([fix(-20 * 60, "parked"), fix(10, "moving")], "start")).toBe("parked");
    expect(pick([fix(-31 * 60, "old"), fix(30, "moving")], "start")).toBe("moving");
    expect(pick([fix(4 * 60, "4 min in")], "start")).toBeNull();
    expect(pick([fix(-30, "parked"), fix(0, "at")], "start")).toBe("at");
    expect(PARKED_BEFORE_MS).toBe(30 * MIN);
  });
  test("a fix with no time is skipped, not stuck on", () => {
    expect(pick([{ t: Number.NaN, tag: "bad" }, fix(-30, "parked")], "start")).toBe("parked");
    expect(pick([{ t: Number.NaN, tag: "bad" }, fix(120, "parked")], "end")).toBe("parked");
    expect(pick([fix(-30, "parked"), { t: Number.NaN, tag: "bad" }], "start")).toBe("parked");
    expect(pick([], "end")).toBeNull();
  });
  test("fixes sorts and drops what isn't a place or a time", () => {
    const got = fixes([
      { at: at(2), value: { lat: "12.9", lon: "77.6" } },
      { at: "not a time", value: { latitude: 1, longitude: 2 } },
      { at: at(1), value: { latitude: 0, longitude: 0 } },
      { at: at(0), value: { latitude: 12.8, longitude: 77.5 } },
    ]);
    expect(got).toEqual([
      { t: t0, lat: 12.8, lng: 77.5 },
      { t: t0 + 2 * MIN, lat: 12.9, lng: 77.6 },
    ]);
  });
});
