import "server-only";
import { mapName, shortName, spotName } from "@/lib/charge-names";
import { stationAt } from "@/lib/stations";
import { latLng, NEAR_MS, nearest } from "@/lib/trip-route";
import { groupTrips } from "@/lib/trips";
import type { Drive } from "@/lib/drives";
import type { Owner } from "./data/owner";
import { cachedPlaceNames, placeKey } from "./place-names";
import { loadReadingsInWindows } from "./telemetry-window";
import { loadUserPlaces } from "./user-places";

// The newest trips the lists name; older rows show their times only. One Location read covers them all.
const NAMED_TRIPS = 30;

type Point = { lat: number; lng: number };
export type TripPlaces = { routes: Record<number, string>; unnamed: Point[] };

// Where each trip went, by its start: "Home to IndianOil e-Charge". Each end is the fix nearest it within 5
// minutes, before or after (nearest, as the trip page's pins: the car sends nothing once parked, so the last
// fix is usually a few seconds before the trip ends), named as the parked places are (the owner's tag, a
// station, then the area kept already; never a Google name, which would need its credit in the row). One
// read of the Location readings takes just those 10 minutes around each end of every trip named (the
// archive's too, for old ones), cut per trip here: the whole span from the oldest to the newest would pass
// the page cap for a heavy driver and lose the newest trips' ends. Only areas kept already are used, so the
// load never waits on a lookup: `unnamed` are the spots without one, for the caller to look up after the
// response (placeNames), so they show on a later load. A trip with either end unknown has none.
export async function loadTripPlaces(owner: Owner, vin: string | null, drives: Drive[]): Promise<TripPlaces> {
  if (!vin || drives.length === 0) return { routes: {}, unnamed: [] };
  const trips = groupTrips(drives)
    .sort((a, b) => b.start - a.start)
    .slice(0, NAMED_TRIPS);
  // [m - 5 min, m + 5 min] around each end: windows are [from, to).
  const around = (m: number) => ({ from: m - NEAR_MS, to: m + NEAR_MS + 1 });
  const edges = trips.flatMap((t) => [around(t.start), around(t.end)]);
  const [read, tags] = await Promise.all([loadReadingsInWindows(owner, vin, ["Location"], edges), loadUserPlaces(owner)]);
  const located = (read?.Location ?? []).flatMap((r) => {
    const p = latLng(r.value);
    return p ? [{ ...p, t: Date.parse(r.at) }] : [];
  });
  const at = (m: number): Point | null => {
    const p = nearest(located, m);
    return p ? { lat: p.lat, lng: p.lng } : null;
  };
  const ends = trips.map((t) => ({ start: t.start, from: at(t.start), to: at(t.end) }));
  const spots = ends.flatMap((e) => [e.from, e.to]).filter((p): p is Point => p !== null);
  const areas = await cachedPlaceNames(spots).catch(() => new Map<string, string>());
  const name = (p: Point | null) => (p ? shortName(mapName(spotName(tags, p, { station: stationAt(p.lat, p.lng), place: areas.get(placeKey(p)) }))) : null);
  const routes: Record<number, string> = {};
  for (const e of ends) {
    const [from, to] = [name(e.from), name(e.to)];
    if (from && to) routes[e.start] = from === to ? `Around ${from}` : `${from} to ${to}`;
  }
  return { routes, unnamed: spots.filter((p) => !areas.has(placeKey(p))) };
}
