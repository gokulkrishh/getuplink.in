import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
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
