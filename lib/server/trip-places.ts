import "server-only";
import { mapName, spotName } from "@/lib/charge-names";
import { stationAt } from "@/lib/stations";
import { groupTrips } from "@/lib/trips";
import type { Drive } from "@/lib/drives";
import type { Owner } from "./data/owner";
import { cachedPlaceNames, placeKey } from "./place-names";
import { loadReadingsByField } from "./telemetry-window";
import { loadUserPlaces } from "./user-places";

const MIN = 60_000;
// The newest trips the lists name; older rows show their times only. One Location read covers them all.
const NAMED_TRIPS = 30;
// Where a trip's start and end are looked for: up to 30 minutes before it set off, 10 after it parked.
const BEFORE_MS = 30 * MIN;
const AFTER_MS = 10 * MIN;

type Point = { lat: number; lng: number };
export type TripPlaces = { routes: Record<number, string>; unnamed: Point[] };

// A Location reading's point, or null.
function point(value: unknown): Point | null {
  const v = value as { latitude?: unknown; longitude?: unknown } | null;
  const lat = typeof v?.latitude === "string" ? Number(v.latitude) : v?.latitude;
  const lng = typeof v?.longitude === "string" ? Number(v.longitude) : v?.longitude;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

// "Home", "Koramangala": a place's name without its city, short enough for a row.
const short = (name: string | null) => name?.split(",")[0]?.trim() || null;

// Where each trip went, by its start: "Home to IndianOil e-Charge". The start is the last place the car was
// seen before it set off (up to 30 minutes before), the end the first after it parked (up to 10 minutes
// after), each named as the parked places are (the owner's tag, a station, then the area kept already;
// never a Google name, which would need its credit in the row). One read of the Location readings spans
// every trip named (the archive's too, for old ones), cut per trip here. Only areas kept already are used,
// so the load never waits on a lookup: `unnamed` are the spots without one, for the caller to look up after
// the response (placeNames), so they show on a later load. A trip with either end unknown has none.
export async function loadTripPlaces(owner: Owner, vin: string | null, drives: Drive[]): Promise<TripPlaces> {
  if (!vin || drives.length === 0) return { routes: {}, unnamed: [] };
  const trips = groupTrips(drives)
    .sort((a, b) => b.start - a.start)
    .slice(0, NAMED_TRIPS);
  const from = Math.min(...trips.map((t) => t.start)) - BEFORE_MS;
  const to = Math.max(...trips.map((t) => t.end)) + AFTER_MS;
  const [read, tags] = await Promise.all([loadReadingsByField(owner, vin, ["Location"], new Date(from).toISOString(), new Date(to).toISOString()), loadUserPlaces(owner)]);
  const located = (read?.Location ?? []).map((r) => ({ t: Date.parse(r.at), value: r.value }));
  const ends = trips.map((t) => {
    const before = located.filter((r) => r.t >= t.start - BEFORE_MS && r.t < t.start + 1);
    const after = located.find((r) => r.t >= t.end && r.t < t.end + AFTER_MS);
    return { start: t.start, from: point(before.at(-1)?.value), to: point(after?.value) };
  });
  const spots = ends.flatMap((e) => [e.from, e.to]).filter((p): p is Point => p !== null);
  const areas = await cachedPlaceNames(spots).catch(() => new Map<string, string>());
  const name = (p: Point | null) => (p ? short(mapName(spotName(tags, p, { station: stationAt(p.lat, p.lng), place: areas.get(placeKey(p)) }))) : null);
  const routes: Record<number, string> = {};
  for (const e of ends) {
    const [from, to] = [name(e.from), name(e.to)];
    if (from && to) routes[e.start] = from === to ? `Around ${from}` : `${from} to ${to}`;
  }
  return { routes, unnamed: spots.filter((p) => !areas.has(placeKey(p))) };
}
