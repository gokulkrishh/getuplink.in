import "server-only";
import type { GoogleSku } from "@/lib/costs";
import { DEMO } from "@/lib/demo";
import { mergeSuggestions, parseNearby, parseReverse, type Suggestion, type Suggestions } from "@/lib/place-suggestions";
import { stationsNear } from "@/lib/stations";
import type { LatLng } from "@/lib/user-places";
import { countGoogleCall } from "./data/system";
import { placeKey, placeNames } from "./place-names";

// Suggestions for "Name this place", asked for only when the owner opens the sheet (one spot, never in
// bulk). With GOOGLE_MAPS_API_KEY: Google's Places API (New) Nearby Search and Geocoding API, as read-only
// hints; nothing from Google is kept. Always: OpenStreetMap's stations (in memory) and area name
// (place_names), which can fill the name field. Each Google call that answers is counted in
// google_usage under its SKU, for Admin > Costs. See docs/place-names.md.

export const NEARBY_M = 150;
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
// Only what the sheet shows. displayName puts the call in Nearby Search Pro (the cheapest tier that has a
// name); no Enterprise fields (ratings, hours, photos), and no ids, since nothing is kept.
export const FIELDS = "places.displayName,places.primaryType,places.types";
export const SKUS = { nearby: "nearbySearchPro", reverse: "geocoding" } as const satisfies Record<string, GoogleSku>;

const googleKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null;


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
  await countGoogleCall(SKUS.nearby);
  return parseNearby(await res.json());
}

async function reverse(key: string, p: LatLng): Promise<Suggestion[]> {
  const url = `${GEOCODE_URL}?latlng=${p.lat},${p.lng}&language=en&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    console.warn("Google reverse geocoding failed:", res.status);
    return [];
  }
  await countGoogleCall(SKUS.reverse);
  const hit = parseReverse(await res.json());
  return hit ? [hit] : [];
}

// Demo hints: made up, and no call leaves the server.
const DEMO_HINTS: Suggestion[] = [
  { name: "Brightwell Charging Hub", detail: "Charging station", source: "google" },
  { name: "Orchard Lane Market", detail: "Shopping mall", source: "google" },
  { name: "14, Orchard Lane, Hillgrove", detail: "Street address", source: "google" },
];

export async function suggestionsAt(p: LatLng): Promise<Suggestions> {
  const stations = stationsNear(p.lat, p.lng).map((name): Suggestion => ({ name, detail: "Charging station", source: "station" }));
  const area = await placeNames([p]).catch(() => new Map<string, string>());
  const areaName = area.get(placeKey(p));
  const picks = mergeSuggestions([[...stations, ...(areaName ? [{ name: areaName, detail: "Area", source: "area" } satisfies Suggestion] : [])]], 4);
  if (DEMO) return { hints: DEMO_HINTS, picks };
  const key = googleKey();
  if (!key) return { hints: [], picks };
  const [places, address] = await Promise.all([nearby(key, p).catch(() => []), reverse(key, p).catch(() => [])]);
  return { hints: mergeSuggestions([places, address], 6), picks };
}
