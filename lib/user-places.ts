// The owner's own names for places ("Your places"), kept in user_places and matched by distance. Pure, so
// tested directly; lib/server/user-places.ts reads and writes them.

// A tag covers this much around where it was made: a car park, a building's drive.
export const TAG_RADIUS_M = 75;
export const NAME_MAX = 60;

export type LatLng = { lat: number; lng: number };

// The name is always the owner's own (typed, or an OpenStreetMap suggestion they picked), so it shows
// everywhere, map pins included.
export type UserPlace = LatLng & { id: number; name: string; radiusM: number };

// What a page needs to offer "Name this place" or a rename: the spot, and its tag when it has one.
export type NameTarget = LatLng & { tag: { id: number; name: string } | null };

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
  return { lat: p.lat, lng: p.lng, tag: tag ? { id: tag.id, name: tag.name } : null };
}

// ---- Input checks for the actions: everything from the browser is untrusted ----

export function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
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
