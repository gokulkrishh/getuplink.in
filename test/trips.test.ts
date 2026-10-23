import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { groupTrips } from "@/lib/trips";

const MIN = 60_000;
const t0 = Date.parse("2026-10-23T10:54:00+05:30");
const leg = (from: number, to: number, km: number, kwh: number | null, levels: [number, number]): Drive => ({
  start: t0 + from * MIN,
  end: t0 + to * MIN,
  km,
  kwh,
  whPerKm: null,
  startLevel: levels[0],
  endLevel: levels[1],
});

describe("groupTrips", () => {
  const shopping = [leg(0, 5, 2, 0.6, [60, 60]), leg(25, 30, 4, 0.9, [59, 58]), leg(35, 75, 34, 6.8, [58, 51])];
  test("short stops keep one trip, with the legs' sums", () => {
    const [trip] = groupTrips(shopping);
    expect(trip.legs).toHaveLength(3);
    expect(trip.stops).toBe(2);
    expect(trip.km).toBe(40);
    expect(trip.kwh).toBeCloseTo(8.3);
    expect([trip.startLevel, trip.endLevel]).toEqual([60, 51]);
  });
  test("a stop of an hour or more starts a new trip, newest first", () => {
    const trips = groupTrips([...shopping, leg(200, 230, 30, 5, [51, 46])]);
    expect(trips.map((t) => t.legs.length)).toEqual([1, 3]);
  });
  test("an unknown leg energy leaves the trip's energy unknown", () => {
    expect(groupTrips([leg(0, 5, 2, null, [60, 60]), leg(10, 20, 5, 1, [60, 59])])[0].kwh).toBe(null);
  });
});
