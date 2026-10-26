import "server-only";
import type { Owner } from "./data/owner";
import { MILES_TO_KM } from "@/lib/car";
import type { Drive } from "@/lib/drives";
import type { Span } from "@/lib/periods";
import { type Band, efficiencyBands, type LatLng, type Place, places, speedHistogram, type TimedValue } from "@/lib/driving-insights";
import { num, type Reading } from "@/lib/telemetry-derive";
import { type SpotName, spotName } from "@/lib/charge-names";
import { stationAt } from "@/lib/stations";
import { placeKey, placeNames } from "./place-names";
import { loadUserPlaces } from "./user-places";
import { loadReadingsByField } from "./telemetry-window";

const DAY = 86_400_000;
export const INSIGHT_DAYS = 30;
const ROUTE_STEP_MS = 30_000; // the visited map keeps a point every 30 s, plenty at city zoom

// Each place's name, best source first (spotName): the owner's tag, a charging station there, then the
// area. The car's own Home, Work or Favourite stays in `tag`, shown beside the name.
export type NamedPlace = Place & SpotName;
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

// The Driving page's insights for the last INSIGHT_DAYS, or for `window` (a range picked by date, cut to the
// drives kept): speed bands, efficiency by temperature and speed, where the car parks, and everywhere it
// went. Each is empty until the car streams its fields.
export async function loadDrivingExtras(owner: Owner, vin: string | null, allDrives: Drive[], now: number, window?: Span): Promise<DrivingExtras> {
  const [extras] = await loadDrivingExtrasFor(owner, vin, allDrives, [window ?? { from: now - INSIGHT_DAYS * DAY, to: now }]);
  return extras;
}

const EMPTY: DrivingExtras = { speed: [], byTemp: [], bySpeed: [], places: [], visited: [] };

// The same insights for each of `windows`, in order, from one read of the readings that spans them all: for
// a page that draws them for every period. The periods' windows all end now and nest, so the read is the
// widest of them.
export async function loadDrivingExtrasFor(owner: Owner, vin: string | null, allDrives: Drive[], windows: Span[]): Promise<DrivingExtras[]> {
  const open = windows.filter((w) => w.from < w.to);
  if (!vin || open.length === 0) return windows.map(() => EMPTY);
  const r = await loadReadingsByField(
    owner,
    vin,
    ["VehicleSpeed", "OutsideTemp", "Location", "LocatedAtHome", "LocatedAtWork", "LocatedAtFavorite"],
    new Date(Math.min(...open.map((w) => w.from))).toISOString(),
    new Date(Math.max(...open.map((w) => w.to))).toISOString(),
  );
  if (!r) return windows.map(() => EMPTY);
  // VehicleSpeed arrives in mph, like the odometer.
  const all = {
    speed: timed(r.VehicleSpeed, MILES_TO_KM),
    temp: timed(r.OutsideTemp),
    locations: located(r.Location),
    home: timed(r.LocatedAtHome),
    work: timed(r.LocatedAtWork),
    favorite: timed(r.LocatedAtFavorite),
  };
  const each = windows.map(({ from, to }) => {
    if (from >= to) return null;
    const within = <T extends { t: number }>(list: T[]) => list.filter((x) => x.t >= from && x.t < to);
    const drives = allDrives.filter((d) => d.start >= from && d.start < to);
    const locations = within(all.locations);
    const parked = places(drives, locations, { home: within(all.home), work: within(all.work), favorite: within(all.favorite) }, to);
    return { drives, locations, parked, speed: within(all.speed), temp: within(all.temp) };
  });
  const tags = await loadUserPlaces(owner);
  // Area names for every shown place, Home and Work included, so a flag sits beside a real name.
  const names = await placeNames(each.flatMap((w) => w?.parked.slice(0, 15) ?? [])).catch(() => new Map<string, string>());
  return each.map((w) => {
    if (!w) return EMPTY;
    const { drives, locations, parked, speed, temp } = w;
    const { byTemp, bySpeed } = efficiencyBands(drives, temp);
    const inDrive = (t: number) => drives.some((d) => t >= d.start - 60_000 && t <= d.end + 60_000);
    const visited = locations.filter((p) => inDrive(p.t)).filter((p, k, all) => k === 0 || p.t - all[k - 1].t >= ROUTE_STEP_MS || all[k - 1].t < p.t - 5 * 60_000);
    return {
      speed: speedHistogram(speed, drives),
      byTemp,
      bySpeed,
      // Google-free (google: null), as the MCP export reads it too; the Driving page adds Google names to
      // the rows it shows (withGoogleNames).
      places: parked.map((p) => ({ ...p, ...spotName(tags, p, { station: stationAt(p.lat, p.lng), place: names.get(placeKey(p)) }) })),
      visited,
    };
  });
}
