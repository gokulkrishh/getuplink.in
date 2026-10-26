// Suggestions for "Name this place", and the parsers for Google's replies. Pure, so tested with fixtures;
// lib/server/place-suggestions.ts makes the calls.
//
// source says where a suggestion came from: Google's need its attribution and stay off our map once kept
// (see docs/place-names.md); OpenStreetMap's (a station from lib/station-data.ts, or the area name) need
// the ODbL credit.
export type SuggestionSource = "google" | "station" | "area";
export type Suggestion = { name: string; detail: string | null; source: SuggestionSource; placeId: string | null };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const CHARGING = "electric_vehicle_charging_station";

// "shopping_mall" reads "Shopping mall".
export function typeWords(type: unknown): string | null {
  const t = text(type);
  if (!t || !/^[a-z_]+$/.test(t)) return null;
  const words = t.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Places API (New) Nearby Search: places[] with id, displayName.text, primaryType and types (the field
// mask in lib/server/place-suggestions.ts). Charging stations first, then
// the rest in Google's order (nearest first, by rankPreference DISTANCE).
export function parseNearby(body: unknown): Suggestion[] {
  const places = isRecord(body) && Array.isArray(body.places) ? body.places : [];
  const out: (Suggestion & { charging: boolean })[] = [];
  for (const p of places) {
    if (!isRecord(p)) continue;
    const name = text(isRecord(p.displayName) ? p.displayName.text : null);
    const id = text(p.id);
    if (!name || !id) continue;
    const charging = p.primaryType === CHARGING || (Array.isArray(p.types) && p.types.includes(CHARGING));
    out.push({ name, detail: charging ? "Charging station" : typeWords(p.primaryType), source: "google", placeId: id, charging });
  }
  return [...out.filter((p) => p.charging), ...out.filter((p) => !p.charging)].map(({ charging: _, ...s }) => s);
}

// Geocoding API reverse lookup: the first street-level result's address, without the country and the
// postcode ("12, 4th Cross Road, Hillgrove, Riverton"). Plus codes are skipped: they name a grid square.
export function parseReverse(body: unknown): Suggestion | null {
  const results = isRecord(body) && body.status === "OK" && Array.isArray(body.results) ? body.results : [];
  for (const r of results) {
    if (!isRecord(r)) continue;
    const types = Array.isArray(r.types) ? r.types : [];
    if (types.includes("plus_code")) continue;
    const address = text(r.formatted_address);
    const id = text(r.place_id);
    if (!address || !id) continue;
    const parts = address.split(",").map((s) => s.trim());
    const kept = parts.slice(0, -1).filter((s) => !/\d{6}/.test(s) && !/\+/.test(s));
    const name = (kept.length ? kept : parts).slice(0, 3).join(", ");
    return { name, detail: "Street address", source: "google", placeId: id };
  }
  return null;
}

// Nominatim's reverse lookup (zoom 16) as an area name: the neighbourhood or suburb, then the city, each
// once ("Hillgrove, Riverton").
export function nominatimName(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const a = isRecord(body.address) ? body.address : {};
  const area = text(a.neighbourhood) ?? text(a.suburb) ?? text(a.quarter) ?? text(a.village) ?? text(a.road) ?? text(body.name);
  const city = text(a.city) ?? text(a.town) ?? text(a.county) ?? text(a.state_district);
  return [area, city].filter((x, k, all) => x && all.indexOf(x) === k).join(", ") || null;
}

// One list, best first: Google's charging stations and places, its address, then OpenStreetMap's station
// and area name. The same name twice is shown once, from the first source.
export function mergeSuggestions(lists: Suggestion[][], max = 8): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of lists.flat()) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, max);
}
