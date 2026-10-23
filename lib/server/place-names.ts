import "server-only";
import { DEMO } from "@/lib/demo";
import { db } from "./supabase";

// Names for parking spots, from OpenStreetMap's Nominatim, cached in place_names so each spot is looked
// up once. Nominatim's policy asks for at most one request a second and a real User-Agent, so a page asks
// for a couple of new names at a time; the rest fill in on later visits.
const NEW_PER_CALL = 2;
const key = (p: { lat: number; lng: number }) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

async function lookUp(p: { lat: number; lng: number }): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${p.lat}&lon=${p.lng}`;
  const res = await fetch(url, { headers: { "User-Agent": "Uplink (https://getuplink.in)", "Accept-Language": "en" }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { name?: string; address?: Record<string, string> };
  const a = body.address ?? {};
  const area = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.village ?? a.road ?? body.name;
  const city = a.city ?? a.town ?? a.county ?? a.state_district;
  return [area, city].filter((x, k, all) => x && all.indexOf(x) === k).join(", ") || null;
}

export async function placeNames(points: { lat: number; lng: number }[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (DEMO || points.length === 0) return names;
  const keys = [...new Set(points.map(key))];
  const { data, error } = await db().from("place_names").select("key, name").in("key", keys);
  if (error) return names;
  for (const r of data as { key: string; name: string | null }[]) if (r.name) names.set(r.key, r.name);
  const known = new Set((data as { key: string }[]).map((r) => r.key));
  const missing = points.filter((p) => !known.has(key(p))).slice(0, NEW_PER_CALL);
  for (const [k, p] of missing.entries()) {
    if (k > 0) await new Promise((r) => setTimeout(r, 1100));
    const name = await lookUp(p).catch(() => null);
    await db().from("place_names").upsert({ key: key(p), name, looked_up_at: new Date().toISOString() }, { onConflict: "key" });
    if (name) names.set(key(p), name);
  }
  return names;
}

export const placeKey = key;
