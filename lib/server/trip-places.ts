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
// The newest trips the lists name; older rows show their times only. Two small Location reads each.
const NAMED_TRIPS = 30;

type Point = { lat: number; lng: number };

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
// never a Google name, which would need its credit in the row). A trip with either end unknown has none.
export async function loadTripPlaces(owner: Owner, vin: string | null, drives: Drive[]): Promise<Record<number, string>> {
  if (!vin || drives.length === 0) return {};
  const trips = groupTrips(drives)
    .sort((a, b) => b.start - a.start)
    .slice(0, NAMED_TRIPS);
  const read = async (from: number, to: number) => (await loadReadingsByField(owner, vin, ["Location"], new Date(from).toISOString(), new Date(to).toISOString()))?.Location ?? [];
  const [ends, tags] = await Promise.all([
    Promise.all(
      trips.map(async (t) => {
        const [before, after] = await Promise.all([read(t.start - 30 * MIN, t.start + 1), read(t.end, t.end + 10 * MIN)]);
        return { start: t.start, from: point(before.at(-1)?.value), to: point(after[0]?.value) };
      }),
    ),
    loadUserPlaces(owner),
  ]);
  const spots = ends.flatMap((e) => [e.from, e.to]).filter((p): p is Point => p !== null);
  const areas = await cachedPlaceNames(spots).catch(() => new Map<string, string>());
  const name = (p: Point | null) => (p ? short(mapName(spotName(tags, p, { station: stationAt(p.lat, p.lng), place: areas.get(placeKey(p)) }))) : null);
  const out: Record<number, string> = {};
  for (const e of ends) {
    const [from, to] = [name(e.from), name(e.to)];
    if (from && to) out[e.start] = from === to ? `Around ${from}` : `${from} to ${to}`;
  }
  return out;
}
