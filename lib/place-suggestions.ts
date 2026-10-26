// Suggestions for "Name this place", and the parsers for Google's and Nominatim's replies. Pure, so
// tested with fixtures; lib/server/place-suggestions.ts makes the calls.
//
// Google's are never copied into the name field (its terms forbid saving its names). A Google place from
// Nearby Search carries its place ID, and tapping it saves only that ID. The street address from
// Geocoding has none and stays read-only. OpenStreetMap's (a station from lib/station-data.ts, or the
// area name) fill the field with a tap, with the ODbL credit. See docs/place-names.md.
export type SuggestionSource = "google" | "station" | "area";
export type Suggestion = { name: string; detail: string | null; source: SuggestionSource; placeId?: string };
// hints: Google's, with "Google Maps" beside them. picks: OpenStreetMap's, which a tap copies into the
// field. tappable: whether a Google place can be saved by its ID yet (the column exists). current: the
// live Google name of the place this tag already is, for a rename.
export type Suggestions = { hints: Suggestion[]; picks: Suggestion[]; tappable: boolean; current: string | null };
export const NO_SUGGESTIONS: Suggestions = { hints: [], picks: [], tappable: false, current: null };

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
// mask in lib/server/place-suggestions.ts). Charging stations first, then the rest in Google's order
// (nearest first, by rankPreference DISTANCE).
export function parseNearby(body: unknown): Suggestion[] {
  const places = isRecord(body) && Array.isArray(body.places) ? body.places : [];
  const out: (Suggestion & { charging: boolean })[] = [];
  for (const p of places) {
    if (!isRecord(p)) continue;
    const name = text(isRecord(p.displayName) ? p.displayName.text : null);
    if (!name) continue;
    const charging = p.primaryType === CHARGING || (Array.isArray(p.types) && p.types.includes(CHARGING));
    const id = text(p.id);
    out.push({ name, detail: charging ? "Charging station" : typeWords(p.primaryType), source: "google", ...(id ? { placeId: id } : {}), charging });
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
    if (!address) continue;
    const parts = address.split(",").map((s) => s.trim());
    const kept = parts.slice(0, -1).filter((s) => !/\d{6}/.test(s) && !/\+/.test(s));
    const name = (kept.length ? kept : parts).slice(0, 3).join(", ");
    return { name, detail: "Street address", source: "google" };
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

// One list, best first, each name once (the first source's), at most `max`.
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
