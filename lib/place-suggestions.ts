// Suggestions for "Name this place", and the parsers for Google's and Nominatim's replies. Pure, so
// tested with fixtures; lib/server/place-suggestions.ts makes the calls.
//
// Google's are never copied into the name field (its terms forbid saving its names). A Google place, from
// Nearby Search or Autocomplete, carries its place ID, and picking it saves only that ID. OpenStreetMap's
// (a station from lib/station-data.ts, or the area name) are saved as a typed name, with the ODbL
// credit. See docs/place-names.md.
export type SuggestionSource = "google" | "station" | "area";
export type Suggestion = { name: string; detail: string | null; source: SuggestionSource; placeId?: string };
// hints: Google's nearby places, with "Google Maps" beside them. picks: OpenStreetMap's, saved as a typed
// name. tappable: whether a Google place can be saved by its ID yet (the column exists). current: the
// live Google name of the place this tag already is, for a rename. search: whether typing asks Google
// (a key is set and a pick can be saved).
export type Suggestions = { hints: Suggestion[]; picks: Suggestion[]; tappable: boolean; current: string | null; search: boolean };
export const NO_SUGGESTIONS: Suggestions = { hints: [], picks: [], tappable: false, current: null, search: false };

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
// (nearest first, by rankPreference DISTANCE). A place without an ID can't be picked, so it's left out.
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

// Places API (New) Autocomplete: suggestions[].placePrediction with placeId and structuredFormat
// (mainText, the place; secondaryText, where it is). Query predictions aren't asked for.
export function parseAutocomplete(body: unknown): Suggestion[] {
  const list = isRecord(body) && Array.isArray(body.suggestions) ? body.suggestions : [];
  const out: Suggestion[] = [];
  for (const item of list) {
    const p = isRecord(item) && isRecord(item.placePrediction) ? item.placePrediction : null;
    if (!p) continue;
    const id = text(p.placeId);
    const f = isRecord(p.structuredFormat) ? p.structuredFormat : {};
    const name = text(isRecord(f.mainText) ? f.mainText.text : null);
    if (!id || !name) continue;
    out.push({ name, detail: text(isRecord(f.secondaryText) ? f.secondaryText.text : null), source: "google", placeId: id });
  }
  return out;
}

// What the search field may send: 2 to 80 characters once spaces are squeezed. Shorter isn't searched
// (each request is billed), longer isn't a place.
export const QUERY_MIN = 2;
export const QUERY_MAX = 80;
export function parseQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const q = value.replace(/\s+/g, " ").trim();
  return q.length >= QUERY_MIN && q.length <= QUERY_MAX ? q : null;
}

// An Autocomplete session token: the browser makes one (a UUID) each time the sheet opens and after a
// pick, and Google groups that search's requests by it.
export function parseSessionToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value) ? value : null;
}

// Whether a suggestion matches what's typed: every word is in its name or detail, ignoring case.
export function matches(s: Suggestion, query: string): boolean {
  const hay = `${s.name} ${s.detail ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
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
