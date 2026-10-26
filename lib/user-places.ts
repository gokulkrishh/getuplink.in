// The owner's own names for places, kept in user_places and matched by distance. Pure, so tested
// directly; lib/server/user-places.ts reads and writes them.

// A tag covers this much around where it was made: a car park, a building's drive.
export const TAG_RADIUS_M = 75;
export const NAME_MAX = 60;

export type LatLng = { lat: number; lng: number };

// A tag is named one of two ways, never both:
// - name: the owner's own (typed, or an OpenStreetMap suggestion they picked). Shows everywhere, map pins
//   included.
// - googlePlaceId: a Google Maps place they tapped. Only the ID is kept, the one thing Google's terms let
//   us store. Its name is fetched live where a row or title shows it, and never on a map
//   (lib/server/google-place-names.ts, docs/place-names.md).
export type UserPlace = LatLng & { id: number; name: string | null; googlePlaceId: string | null; radiusM: number };

// What a page needs to offer "Name this place" or a rename: the spot, and its tag when it has one.
export type TargetTag = { id: number; name: string | null; googlePlaceId: string | null };
export type NameTarget = LatLng & { tag: TargetTag | null };

export const targetTag = (t: UserPlace): TargetTag => ({ id: t.id, name: t.name, googlePlaceId: t.googlePlaceId });

export function metres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

// The nearest tag whose radius takes in the point, or null.
export function tagAt(tags: readonly UserPlace[], p: LatLng): UserPlace | null {
  let best: UserPlace | null = null;
  let bestM = Infinity;
  for (const t of tags) {
    const d = metres(t, p);
    if (d <= t.radiusM && d < bestM) [best, bestM] = [t, d];
  }
  return best;
}

export function nameTarget(tags: readonly UserPlace[], p: LatLng): NameTarget {
  const tag = tagAt(tags, p);
  return { lat: p.lat, lng: p.lng, tag: tag ? targetTag(tag) : null };
}

// ---- Input checks for the actions: everything from the browser is untrusted ----

export function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

// A Google place ID: letters, digits, "_" and "-". Google sets no fixed length; 1,000 is far past any seen.
export const PLACE_ID_MAX = 1000;
export function parsePlaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length >= 10 && id.length <= PLACE_ID_MAX && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

export function parsePoint(lat: unknown, lng: unknown): LatLng | null {
  const a = typeof lat === "string" ? Number(lat) : lat;
  const b = typeof lng === "string" ? Number(lng) : lng;
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}

export function parseId(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}
