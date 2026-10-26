import "server-only";
import { DEMO } from "@/lib/demo";
import { mergeSuggestions, parseNearby, parseReverse, type Suggestion } from "@/lib/place-suggestions";
import { stationsNear } from "@/lib/stations";
import type { LatLng } from "@/lib/user-places";
import { placeKey, placeNames } from "./place-names";

// Suggestions for "Name this place", asked for only when the owner opens the sheet (one spot, never in
// bulk). Google's Places API (New) Nearby Search and Geocoding API, with GOOGLE_MAPS_API_KEY, plus
// OpenStreetMap's stations (in memory) and area name (place_names). Google's results are not cached: its
// terms allow keeping only place IDs, which a confirmed name keeps (user_places.google_place_id). See
// docs/place-names.md for the terms and the expected calls.

export const NEARBY_M = 150;
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
// Only what the sheet shows. displayName puts the call in Nearby Search Pro (the cheapest tier that has a
// name); no Enterprise fields (ratings, hours, photos). The type's words are made here from primaryType.
export const FIELDS = "places.id,places.displayName,places.primaryType,places.types";

const googleKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

export type Suggestions = { items: Suggestion[]; google: boolean };

async function nearby(key: string, p: LatLng): Promise<Suggestion[]> {
  const res = await fetch(NEARBY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      maxResultCount: 8,
      rankPreference: "DISTANCE",
      languageCode: "en",
      locationRestriction: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: NEARBY_M } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn("Google Nearby Search failed:", res.status);
    return [];
  }
  return parseNearby(await res.json());
}

async function reverse(key: string, p: LatLng): Promise<Suggestion[]> {
  const url = `${GEOCODE_URL}?latlng=${p.lat},${p.lng}&language=en&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    console.warn("Google reverse geocoding failed:", res.status);
    return [];
  }
  const hit = parseReverse(await res.json());
  return hit ? [hit] : [];
}

// Demo suggestions: made up, and no call leaves the server.
const DEMO_SUGGESTIONS: Suggestion[] = [
  { name: "Brightwell Charging Hub", detail: "Charging station", source: "google", placeId: "demo-place-brightwell-0001" },
  { name: "Orchard Lane Market", detail: "Shopping mall", source: "google", placeId: "demo-place-orchard-00002" },
  { name: "14, Orchard Lane, Hillgrove", detail: "Street address", source: "google", placeId: "demo-place-address-0003" },
];

export async function suggestionsAt(p: LatLng): Promise<Suggestions> {
  const stations = stationsNear(p.lat, p.lng).map((name): Suggestion => ({ name, detail: "Charging station", source: "station", placeId: null }));
  const area = await placeNames([p]).catch(() => new Map<string, string>());
  const areaName = area.get(placeKey(p));
  const osm = [...stations, ...(areaName ? [{ name: areaName, detail: "Area", source: "area", placeId: null } satisfies Suggestion] : [])];
  if (DEMO) return { items: mergeSuggestions([DEMO_SUGGESTIONS, osm]), google: true };
  const key = googleKey();
  if (!key) return { items: mergeSuggestions([osm]), google: false };
  const [places, address] = await Promise.all([nearby(key, p).catch(() => []), reverse(key, p).catch(() => [])]);
  const google = [...places, ...address];
  return { items: mergeSuggestions([google, osm]), google: google.length > 0 };
}
