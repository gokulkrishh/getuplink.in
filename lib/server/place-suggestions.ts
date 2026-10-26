import "server-only";
import type { GoogleSku } from "@/lib/costs";
import { DEMO } from "@/lib/demo";
import { matches, mergeSuggestions, parseAutocomplete, parseNearby, type Suggestion } from "@/lib/place-suggestions";
import { stationsNear } from "@/lib/stations";
import type { LatLng } from "@/lib/user-places";
import { countGoogleCall } from "./data/system";
import { googleKey } from "./google-place-names";
import { placeKey, placeNames } from "./place-names";

// Suggestions for "Name this place", asked for only while the owner has the sheet open (one spot, never in
// bulk). With GOOGLE_MAPS_API_KEY: Places API (New) Nearby Search when the sheet opens, and Autocomplete
// as the owner types (app/api/places/autocomplete). A Google place can be picked, which saves only its
// place ID; nothing else from Google is kept. Always: OpenStreetMap's stations (in memory) and area name
// (place_names). Each Google call that answers is counted in google_usage under its SKU, for Admin >
// Costs. See docs/place-names.md.

export const NEARBY_M = 150;
// Autocomplete favours places this close to the pin, without hiding ones further off.
export const BIAS_M = 5000;
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
// Only what the sheet shows, plus the ID a pick saves. displayName puts the call in Nearby Search Pro (the
// cheapest tier that has a name); id is an IDs Only field, so it adds nothing. No Enterprise fields
// (ratings, hours, photos).
export const FIELDS = "places.id,places.displayName,places.primaryType,places.types";
export const AUTOCOMPLETE_FIELDS = "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat";
export const SKUS = { nearby: "nearbySearchPro", autocomplete: "autocomplete" } as const satisfies Record<string, GoogleSku>;

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

// Demo places: made up, with the demo's place IDs (DEMO_GOOGLE_NAMES), and no call leaves the server.
const DEMO_HINTS: Suggestion[] = [
  { name: "Brightwell Charging Hub", detail: "Charging station", source: "google", placeId: "DemoPlace_Brightwell01" },
  { name: "Orchard Lane Market", detail: "Shopping mall", source: "google", placeId: "DemoPlace_OrchardLane01" },
];
const DEMO_SEARCH: Suggestion[] = [
  ...DEMO_HINTS.map((s) => ({ ...s, detail: "Orchard Lane, Hillgrove" })),
  { name: "Brightwell Fuel Station", detail: "Ring Road, Riverton", source: "google", placeId: "DemoPlace_BrightwellFuel01" },
  { name: "Hillgrove Tech Park", detail: "Hillgrove, Riverton", source: "google", placeId: "DemoPlace_HillgroveTech01" },
  { name: "Riverton Central Mall", detail: "MG Road, Riverton", source: "google", placeId: "DemoPlace_RivertonMall01" },
];

export async function suggestionsAt(p: LatLng): Promise<{ hints: Suggestion[]; picks: Suggestion[] }> {
  const stations = stationsNear(p.lat, p.lng).map((name): Suggestion => ({ name, detail: "Charging station", source: "station" }));
  const area = await placeNames([p]).catch(() => new Map<string, string>());
  const areaName = area.get(placeKey(p));
  const picks = mergeSuggestions([[...stations, ...(areaName ? [{ name: areaName, detail: "Area", source: "area" } satisfies Suggestion] : [])]], 4);
  if (DEMO) return { hints: DEMO_HINTS, picks };
  const key = googleKey();
  if (!key) return { hints: [], picks };
  return { hints: mergeSuggestions([await nearby(key, p).catch(() => [])], 6), picks };
}

// Google's places for what the owner typed, nearest the pin first. `unavailable` when Google said no (a
// quota reached, a key problem) or didn't answer, so the sheet can say search is off and still save the
// typed name. The query is never logged or stored.
export type SearchResult = { results: Suggestion[]; unavailable: boolean };
export const MAX_RESULTS = 5;

export async function searchPlaces(query: string, p: LatLng, sessionToken: string): Promise<SearchResult> {
  if (DEMO) return { results: DEMO_SEARCH.filter((s) => matches(s, query)).slice(0, MAX_RESULTS), unavailable: false };
  const key = googleKey();
  if (!key) return { results: [], unavailable: true };
  try {
    const res = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": AUTOCOMPLETE_FIELDS },
      body: JSON.stringify({
        input: query,
        sessionToken,
        languageCode: "en",
        includedRegionCodes: ["in"],
        locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: BIAS_M } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn("Google Autocomplete failed:", res.status);
      return { results: [], unavailable: true };
    }
    await countGoogleCall(SKUS.autocomplete);
    return { results: parseAutocomplete(await res.json()).slice(0, MAX_RESULTS), unavailable: false };
  } catch (err) {
    console.warn("Google Autocomplete failed:", (err as Error).name);
    return { results: [], unavailable: true };
  }
}
