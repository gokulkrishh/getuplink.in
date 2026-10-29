import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { packReadings } from "@/lib/drive-archive";
import type { Drive } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";
import { FakeDb } from "./fake-db";

// The Driving page's trip names ("Home to Indiranagar") for 30 trips: one read of the Location readings
// covers them all (not two a trip), an old trip still reads the drive archive, and the names come out as
// they did. The page's load names only spots already kept; nothing is looked up while it waits.

let fake: FakeDb;
const fetched: string[] = [];

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
const realFetch = globalThis.fetch;
const recordFetch = (async (url: string | URL) => (fetched.push(String(url)), new Response("{}", { status: 200 }))) as unknown as typeof fetch;

const { asOwner } = await import("@/lib/server/data/owner");
const { loadTripPlaces } = await import("@/lib/server/trip-places");

const VIN = "LRWYGCEK0PC000001";
const owner = asOwner(1, "tesla-a");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (t: number) => new Date(t).toISOString();

// Three spots in Bengaluru: Home is the owner's tag, the others are areas kept in place_names.
const HOME = { latitude: 12.9352, longitude: 77.6245 };
const SHIVAJINAGAR = { latitude: 12.9857, longitude: 77.6057 };
const INDIRANAGAR = { latitude: 12.9784, longitude: 77.6408 };
const SPOTS = [HOME, SHIVAJINAGAR, INDIRANAGAR];
const key = (p: { latitude: number; longitude: number }) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;

// A trip's Location readings as the car sends them: two fixes while parked before it, one a minute while
// driving (the coordinates as strings, as some arrive), and one after it parks.
function tripReadings(start: number, end: number, from: typeof HOME, to: typeof HOME): Reading[] {
  const out: Reading[] = [
    { at: iso(start - 25 * MIN), value: from },
    { at: iso(start - 4 * MIN), value: from },
  ];
  for (let t = start; t < end; t += MIN) {
    const f = (t - start) / (end - start);
    const lat = from.latitude + (to.latitude - from.latitude) * f;
    const lng = from.longitude + (to.longitude - from.longitude) * f;
    out.push({ at: iso(t), value: t === start ? from : { latitude: String(lat), longitude: String(lng) } });
  }
  out.push({ at: iso(end + 2 * MIN), value: to });
  return out;
}

const drive = (start: number, end: number): Drive => ({ start, end, km: 8, kwh: 1.2, whPerKm: 150, startLevel: 70, endLevel: 68 });

// 29 recent trips, one every 12 hours, each 15 minutes, going round the three spots; and one 100 days ago
// whose full readings are gone, kept in the drive archive only.
const recent = Array.from({ length: 29 }, (_, k) => {
  const start = NOW - (k + 1) * 12 * HOUR;
  return { start, end: start + 15 * MIN, from: SPOTS[k % 3], to: SPOTS[(k + 1) % 3] };
});
const old = { start: NOW - 100 * DAY, end: NOW - 100 * DAY + 20 * MIN, from: INDIRANAGAR, to: HOME };
const drives = [...recent, old].map((t) => drive(t.start, t.end));
const short = (p: typeof HOME) => (p === HOME ? "Home" : p === SHIVAJINAGAR ? "Shivajinagar" : "Indiranagar");

beforeEach(() => {
  fetched.length = 0;
  globalThis.fetch = recordFetch;
  fake = new FakeDb({
    vehicles: [{ id: 1, user_id: 1, vin: VIN }],
    telemetry_readings: recent.flatMap((t) => tripReadings(t.start, t.end, t.from, t.to).map((r) => ({ vin: VIN, field: "Location", created_at: r.at, value: r.value }))),
    user_drive_archive: [
      {
        user_id: 1,
        vin: VIN,
        readings_from: iso(old.start - 30 * MIN),
        readings_to: iso(old.end + 10 * MIN),
        readings: packReadings({ Location: tripReadings(old.start, old.end, old.from, old.to) }),
      },
    ],
    user_places: [{ id: 1, user_id: 1, name: "Home", lat: HOME.latitude, lng: HOME.longitude, radius_m: 150, updated_at: iso(NOW) }],
    place_names: [
      { key: key(SHIVAJINAGAR), name: "Shivajinagar, Bengaluru" },
      { key: key(INDIRANAGAR), name: "Indiranagar, Bengaluru" },
    ],
  });
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("loadTripPlaces", () => {
  test("names 30 trips as before, from one read of their readings", async () => {
    const { routes } = await loadTripPlaces(owner, VIN, drives);
    const want = Object.fromEntries([...recent, old].map((t) => [t.start, `${short(t.from)} to ${short(t.to)}`]));
    expect(routes).toEqual(want);
    // One paged read of the readings and one of the archive, not two of each a trip.
    const reads = fake.calls.filter((c) => c.table === "user_telemetry_readings");
    const archive = fake.calls.filter((c) => c.table === "user_drive_archive");
    expect(reads.length).toBe(1);
    expect(archive.length).toBe(1);
    expect(fetched).toEqual([]);
  });

  test("a spot with no name kept yet leaves its trips unnamed, and is handed back to look up later", async () => {
    fake.tables.place_names = [{ key: key(SHIVAJINAGAR), name: "Shivajinagar, Bengaluru" }];
    const { routes, unnamed } = await loadTripPlaces(owner, VIN, drives);
    // Never a guessed name: every trip touching Indiranagar has none.
    for (const t of [...recent, old]) {
      const touches = t.from === INDIRANAGAR || t.to === INDIRANAGAR;
      expect(routes[t.start] as string | undefined).toBe(touches ? undefined : `${short(t.from)} to ${short(t.to)}`);
    }
    // The page waits on no lookup; the spot comes back for one after the response.
    expect(fetched).toEqual([]);
    expect(unnamed.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`)).toContain(key(INDIRANAGAR));
  });

  test("no car or no drives: nothing read", async () => {
    expect(await loadTripPlaces(owner, null, drives)).toEqual({ routes: {}, unnamed: [] });
    expect(await loadTripPlaces(owner, VIN, [])).toEqual({ routes: {}, unnamed: [] });
    expect(fake.calls.length).toBe(0);
  });
});
