import "server-only";
import { DEMO } from "@/lib/demo";
import { envValue } from "@/lib/sandbox/flag";
import { nominatimName } from "@/lib/place-suggestions";
import { placeNamesFor, savePlaceName } from "./data/system";

// Names for parking spots, from OpenStreetMap's Nominatim, cached in place_names so each spot is looked
// up once. Nominatim's usage policy (docs/place-names.md): at most one request a second, a User-Agent that
// identifies the app with a contact, results cached, no bulk or systematic lookups, and a way to turn it
// off without a release. So a page asks for a couple of new names at a time; the rest fill in on later
// visits.
const NEW_PER_CALL = 2;
const key = (p: { lat: number; lng: number }) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

// OSM_LOOKUPS=off stops every call to Nominatim; the names already kept still show.
export const osmLookupsOn = () => envValue("OSM_LOOKUPS")?.trim().toLowerCase() !== "off";

// "Uplink/1.0 (+https://getuplink.in; <contact>)": OSM_CONTACT is an email or URL the OSM operators can
// reach. Without it the app's site stands in.
export function osmUserAgent(): string {
  const contact = process.env.OSM_CONTACT?.trim();
  return `Uplink/1.0 (+https://getuplink.in${contact ? `; ${contact}` : ""})`;
}

// One request a second from this server instance, however many pages ask at once.
const GAP_MS = 1100;
let nextSlot = 0;
async function osmTurn(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function lookUp(p: { lat: number; lng: number }): Promise<string | null> {
  await osmTurn();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${p.lat}&lon=${p.lng}`;
  const res = await fetch(url, { headers: { "User-Agent": osmUserAgent(), "Accept-Language": "en" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  return nominatimName(await res.json());
}

export async function placeNames(points: { lat: number; lng: number }[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (points.length === 0) return names;
  if (DEMO) {
    const { DEMO_PLACES } = await import("./demo");
    for (const p of points) {
      const hit = DEMO_PLACES.find(([lat, lng]) => Math.abs(lat - p.lat) + Math.abs(lng - p.lng) < 0.01);
      if (hit) names.set(key(p), hit[2]);
    }
    return names;
  }
  const keys = [...new Set(points.map(key))];
  const { data, error } = await placeNamesFor(keys);
  if (error) return names;
  for (const r of data as { key: string; name: string | null }[]) if (r.name) names.set(r.key, r.name);
  const known = new Set((data as { key: string }[]).map((r) => r.key));
  if (!osmLookupsOn()) return names;
  const missing = points.filter((p) => !known.has(key(p))).slice(0, NEW_PER_CALL);
  for (const p of missing) {
    const name = await lookUp(p).catch(() => null);
    await savePlaceName(key(p), name);
    if (name) names.set(key(p), name);
  }
  return names;
}

// Only the names already kept: no lookups and no writes, for pages that read what exists.
export async function cachedPlaceNames(points: { lat: number; lng: number }[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (points.length === 0) return names;
  if (DEMO) return placeNames(points);
  const { data, error } = await placeNamesFor([...new Set(points.map(key))]);
  if (error) return names;
  for (const r of data as { key: string; name: string | null }[]) if (r.name) names.set(r.key, r.name);
  return names;
}

export const placeKey = key;
