import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { packReadings } from "@/lib/drive-archive";
import type { Drive } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";
import { FakeDb } from "./fake-db";

// The Driving page's trip names ("Home to Indiranagar") for 30 trips: one read of the Location readings
// covers them all (not two a trip) and takes only each trip's edges, an old trip still reads the drive
// archive, and the names come out as they did. The page's load names only spots already kept; nothing is
// looked up while it waits.

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

// A trip's Location readings: two fixes while parked before it, one a minute while driving (the coordinates
// as strings, as some arrive; the last, a minute before it parks, already there), and one after it parks.
function tripReadings(start: number, end: number, from: typeof HOME, to: typeof HOME): Reading[] {
  const out: Reading[] = [
    { at: iso(start - 25 * MIN), value: from },
    { at: iso(start - 4 * MIN), value: from },
  ];
  for (let t = start; t < end; t += MIN) {
    const f = (t - start) / (end - start);
    const lat = from.latitude + (to.latitude - from.latitude) * f;
    const lng = from.longitude + (to.longitude - from.longitude) * f;
    out.push({ at: iso(t), value: t === start ? from : t + MIN >= end ? to : { latitude: String(lat), longitude: String(lng) } });
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
    // Every finished drive is archived each night, the recent ones too.
    user_drive_archive: [...recent, old].map((t) => ({
      user_id: 1,
      vin: VIN,
      readings_from: iso(t.start - 30 * MIN),
      readings_to: iso(t.end + 10 * MIN),
      readings: packReadings({ Location: tripReadings(t.start, t.end, t.from, t.to) }),
    })),
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

// How many time windows one recorded request asked for (one and(...) each in its or=).
const windowsIn = (c: { filters: string[] }) => c.filters.join(" ").split("and(").length - 1;

describe("loadTripPlaces", () => {
  test("names 30 trips as before, from a few reads of just their edges", async () => {
    const { routes } = await loadTripPlaces(owner, VIN, drives);
    const want = Object.fromEntries([...recent, old].map((t) => [t.start, `${short(t.from)} to ${short(t.to)}`]));
    expect(routes).toEqual(want);
    // A few reads of at most 10 windows each, so no request URL gets long, and one of the archive: not two
    // of each a trip.
    const reads = fake.calls.filter((c) => c.table === "user_telemetry_readings");
    const archive = fake.calls.filter((c) => c.table === "user_drive_archive");
    expect(reads.length).toBeLessThanOrEqual(6);
    expect(Math.max(...reads.map(windowsIn))).toBeLessThanOrEqual(10);
    expect(archive.length).toBe(1);
    expect(fetched).toEqual([]);
    // Only each trip's edges come back: the 4 fixes from 30 minutes before its start to a minute after, and
    // the 2 from a minute before its end to 10 after, not the drive between or the 100 days around them. The
    // archive sends the old trip's drive only.
    expect(reads.reduce((n, c) => n + (c.rows ?? 0), 0)).toBe(6 * recent.length);
    expect(archive[0].rows).toBe(1);
  });

  test("a heavy driver's newest trips are named too, past the readings' page cap", async () => {
    // 30 trips of 2 hours, one fix every 10 s as the car sends Location: over 21,000 readings between the
    // oldest and the newest, more than the 20 pages of 1,000 one read may take.
    const long = Array.from({ length: 30 }, (_, k) => {
      const start = NOW - (k + 1) * 12 * HOUR;
      return { start, end: start + 2 * HOUR, from: SPOTS[k % 3], to: SPOTS[(k + 1) % 3] };
    });
    const everyTenSeconds = (t: (typeof long)[number]): Reading[] => [
      { at: iso(t.start - 4 * MIN), value: t.from },
      ...Array.from({ length: (t.end - t.start) / 10_000 }, (_, k) => ({ at: iso(t.start + k * 10_000), value: k === 0 ? t.from : t.start + k * 10_000 >= t.end - 30_000 ? t.to : { latitude: 13, longitude: 77.7 } })),
      { at: iso(t.end + 2 * MIN), value: t.to },
    ];
    fake.tables.telemetry_readings = long.flatMap((t) => everyTenSeconds(t).map((r) => ({ vin: VIN, field: "Location", created_at: r.at, value: r.value })));
    fake.tables.user_drive_archive = [];
    expect(fake.tables.telemetry_readings.length).toBeGreaterThan(20_000);
    const { routes } = await loadTripPlaces(owner, VIN, long.map((t) => drive(t.start, t.end)));
    expect(routes).toEqual(Object.fromEntries(long.map((t) => [t.start, `${short(t.from)} to ${short(t.to)}`])));
    const reads = fake.calls.filter((c) => c.table === "user_telemetry_readings");
    expect(reads.length).toBeLessThanOrEqual(6);
    expect(Math.max(...reads.map(windowsIn))).toBeLessThanOrEqual(10);
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

  // As the car really sends Location: a fix every 10 s while driving and often nothing once it is in Park
  // (Tesla sends on change), so the last fix may be a few seconds before the trip ends. Each end is where the
  // car was parked (a fix up to 30 minutes before the start, or 10 after the end) or else a moving fix within
  // a minute of it; a fix further into the drive can be kilometres away. The trip page uses the same rule.
  const streamed = (t: { start: number; end: number; from: typeof HOME; to: typeof HOME }, o: { firstAt?: number; lastAt?: number } = {}): Reading[] => {
    const first = o.firstAt ?? t.start;
    const last = o.lastAt ?? t.end - 4_000;
    const out: Reading[] = [];
    for (let at = first; at <= last; at += 10_000) {
      const value = at < first + 30_000 ? t.from : at > last - 30_000 ? t.to : { latitude: String(13), longitude: String(77.7) };
      out.push({ at: iso(at), value });
    }
    return out;
  };
  const three = [0, 1, 2].map((k) => {
    const start = NOW - (k + 1) * 12 * HOUR;
    return { start, end: start + 15 * MIN, from: SPOTS[k % 3], to: SPOTS[(k + 1) % 3] };
  });
  const useReadings = (rows: Reading[]) => {
    fake.tables.telemetry_readings = rows.map((r) => ({ vin: VIN, field: "Location", created_at: r.at, value: r.value }));
    fake.tables.user_drive_archive = [];
  };
  const named = (t: (typeof three)[number]) => `${short(t.from)} to ${short(t.to)}`;
  const MIDWAY = { latitude: 13, longitude: 77.7 };

  test("names a trip whose last fix is a few seconds before it parks, with nothing after", async () => {
    useReadings(three.flatMap((t) => streamed(t)));
    const { routes } = await loadTripPlaces(owner, VIN, three.map((t) => drive(t.start, t.end)));
    expect(routes).toEqual(Object.fromEntries(three.map((t) => [t.start, named(t)])));
    expect(routes[three[0].start]).toBe("Home to Shivajinagar");
  });

  test("no end when the last fix is more than a minute before it parks and none comes after", async () => {
    const [cut, ...rest] = three;
    useReadings([...streamed(cut, { lastAt: cut.end - 2 * MIN }), ...rest.flatMap((t) => streamed(t))]);
    const { routes } = await loadTripPlaces(owner, VIN, three.map((t) => drive(t.start, t.end)));
    expect(routes[cut.start] as string | undefined).toBeUndefined();
    expect(routes).toEqual(Object.fromEntries(rest.map((t) => [t.start, named(t)])));
  });

  test("with no fix before it sets off, only a moving fix within a minute names the start", async () => {
    // First fix 30 s in: named. 4 minutes in the car can be kilometres away: no start, so no name. 10 s in: named.
    const [soon, late, after] = three;
    useReadings([...streamed(soon, { firstAt: soon.start + 30_000 }), ...streamed(late, { firstAt: late.start + 4 * MIN }), ...streamed(after, { firstAt: after.start + 10_000 })]);
    const { routes } = await loadTripPlaces(owner, VIN, three.map((t) => drive(t.start, t.end)));
    expect(routes).toEqual({ [soon.start]: named(soon), [after.start]: named(after) });
  });

  test("a parked fix 20 minutes before it sets off names the start", async () => {
    // The car sends nothing while parked, so the last fix before the drive can be well before it. Driving
    // fixes start only 2 minutes in, mid-route.
    const t = three[0];
    useReadings([{ at: iso(t.start - 20 * MIN), value: t.from }, { at: iso(t.start + 2 * MIN), value: MIDWAY }, { at: iso(t.end - 4_000), value: t.to }]);
    const { routes } = await loadTripPlaces(owner, VIN, [drive(t.start, t.end)]);
    expect(routes).toEqual({ [t.start]: named(t) });
  });

  test("at the end, a parked fix after it stops beats a moving fix seconds before", async () => {
    // Still rolling 5 s before Park, mid-route; the parked fix 2 minutes later says where it stopped.
    const t = three[0];
    useReadings([{ at: iso(t.start), value: t.from }, { at: iso(t.end - 5_000), value: MIDWAY }, { at: iso(t.end + 2 * MIN), value: t.to }]);
    const { routes } = await loadTripPlaces(owner, VIN, [drive(t.start, t.end)]);
    expect(routes).toEqual({ [t.start]: "Home to Shivajinagar" });
  });

  test("at the start, a parked fix before it sets off beats a moving fix seconds after", async () => {
    // Parked at Home 3 minutes before; 10 s in, already rolling past Indiranagar's key.
    const t = three[0];
    useReadings([{ at: iso(t.start - 3 * MIN), value: HOME }, { at: iso(t.start + 10_000), value: INDIRANAGAR }, { at: iso(t.end - 4_000), value: SHIVAJINAGAR }]);
    const { routes } = await loadTripPlaces(owner, VIN, [drive(t.start, t.end)]);
    expect(routes).toEqual({ [t.start]: "Home to Shivajinagar" });
  });

  test("the latest parked fix before the start and the first after the end name it", async () => {
    // Two parked fixes before the start (Indiranagar 4 minutes before, then Home 30 s before): the later one,
    // Home. At the end, one 4 minutes before (still driving, too early to say) and one a minute after: Shivajinagar.
    const t = three[0];
    useReadings([
      { at: iso(t.start - 4 * MIN), value: INDIRANAGAR },
      { at: iso(t.start - 30_000), value: HOME },
      { at: iso(t.end - 4 * MIN), value: INDIRANAGAR },
      { at: iso(t.end + MIN), value: SHIVAJINAGAR },
    ]);
    const { routes } = await loadTripPlaces(owner, VIN, [drive(t.start, t.end)]);
    expect(routes).toEqual({ [t.start]: "Home to Shivajinagar" });
  });

  test("no car or no drives: nothing read", async () => {
    expect(await loadTripPlaces(owner, null, drives)).toEqual({ routes: {}, unnamed: [] });
    expect(await loadTripPlaces(owner, VIN, [])).toEqual({ routes: {}, unnamed: [] });
    expect(fake.calls.length).toBe(0);
  });
});
