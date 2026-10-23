import "server-only";
import { MILES_TO_KM } from "@/lib/car";
import type { Drive } from "@/lib/drives";
import { type Band, efficiencyBands, type LatLng, type Place, places, speedHistogram, type TimedValue } from "@/lib/driving-insights";
import { num, type Reading } from "@/lib/telemetry-derive";
import { placeKey, placeNames } from "./place-names";
import { loadReadingsByField } from "./telemetry-window";

const DAY = 86_400_000;
export const INSIGHT_DAYS = 30;
const ROUTE_STEP_MS = 30_000; // the visited map keeps a point every 30 s, plenty at city zoom

export type NamedPlace = Place & { name: string | null };
export type DrivingExtras = {
  speed: { from: number; to: number | null; share: number }[];
  byTemp: Band[];
  bySpeed: Band[];
  places: NamedPlace[];
  visited: { lat: number; lng: number; t: number }[];
};

const timed = (readings: Reading[] | undefined, scale = 1): TimedValue[] =>
  (readings ?? []).flatMap((r) => {
    const v = typeof r.value === "boolean" ? (r.value ? 1 : 0) : num(r.value);
    return v === null ? [] : [{ t: Date.parse(r.at), v: v * scale }];
  });

const located = (readings: Reading[] | undefined): LatLng[] =>
  (readings ?? []).flatMap((r) => {
    const v = r.value as { latitude?: number; longitude?: number; lat?: number; lng?: number } | null;
    const lat = num(v?.latitude ?? v?.lat);
    const lng = num(v?.longitude ?? v?.lng);
    return lat === null || lng === null || (lat === 0 && lng === 0) ? [] : [{ t: Date.parse(r.at), lat, lng }];
  });

// The Driving page's insights for the last INSIGHT_DAYS: speed bands, efficiency by temperature and
// speed, where the car parks, and everywhere it went. Each is empty until the car streams its fields.
export async function loadDrivingExtras(vin: string | null, allDrives: Drive[], now: number): Promise<DrivingExtras> {
  const empty: DrivingExtras = { speed: [], byTemp: [], bySpeed: [], places: [], visited: [] };
  if (!vin) return empty;
  const from = now - INSIGHT_DAYS * DAY;
  const drives = allDrives.filter((d) => d.start >= from);
  const r = await loadReadingsByField(
    vin,
    ["VehicleSpeed", "OutsideTemp", "Location", "LocatedAtHome", "LocatedAtWork", "LocatedAtFavorite"],
    new Date(from).toISOString(),
    new Date(now).toISOString(),
  );
  if (!r) return empty;
  const locations = located(r.Location);
  // VehicleSpeed arrives in mph, like the odometer.
  const { byTemp, bySpeed } = efficiencyBands(drives, timed(r.OutsideTemp));
  const parked = places(drives, locations, { home: timed(r.LocatedAtHome), work: timed(r.LocatedAtWork), favorite: timed(r.LocatedAtFavorite) }, now);
  const names = await placeNames(parked.filter((p) => !p.tag).slice(0, 12));
  const inDrive = (t: number) => drives.some((d) => t >= d.start - 60_000 && t <= d.end + 60_000);
  const visited = locations.filter((p) => inDrive(p.t)).filter((p, k, all) => k === 0 || p.t - all[k - 1].t >= ROUTE_STEP_MS || all[k - 1].t < p.t - 5 * 60_000);
  return {
    speed: speedHistogram(timed(r.VehicleSpeed, MILES_TO_KM), drives),
    byTemp,
    bySpeed,
    places: parked.map((p) => ({ ...p, name: names.get(placeKey(p)) ?? null })),
    visited,
  };
}
