import "server-only";
import { cache } from "react";
import type { GoogleSku } from "@/lib/costs";
import type { SpotName } from "@/lib/charge-names";
import { DEMO } from "@/lib/demo";
import { countGoogleCall } from "./data/system";

// Names for the places the owner named by tapping a Google suggestion. user_places keeps only the place
// ID (Google lets us store IDs indefinitely); the name is asked for live, with Place Details (New), each
// time a row or title shows it. Nothing from the reply is stored: fetch runs with no-store, and React's
// cache() shares one answer within a single render only. Pages read through "use cache: private",
// which keeps no server copy in production. Never inside "use cache" or "use cache: remote".
// docs/place-names.md has the terms and the price.

const DETAILS_URL = "https://places.googleapis.com/v1/places/";
// displayName is the only field asked for. It is a Pro field: the IDs Only SKU has no name, and the
// Essentials fields are addresses. So each lookup bills Place Details Pro.
export const DETAILS_FIELDS = "displayName";
export const DETAILS_SKU = "placeDetailsPro" as const satisfies GoogleSku;
// A page asks for at most this many names; rows past it show the safe name.
export const MAX_LOOKUPS = 20;

export const googleKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

// Demo place IDs and their made-up names; no call leaves the server.
export const DEMO_GOOGLE_NAMES: Record<string, string> = {
  DemoPlace_Brightwell01: "Brightwell Charging Hub",
  DemoPlace_OrchardLane01: "Orchard Lane Market",
};

export function parseDisplayName(body: unknown): string | null {
  const dn = typeof body === "object" && body !== null ? (body as { displayName?: { text?: unknown } }).displayName : null;
  const text = typeof dn?.text === "string" ? dn.text.trim() : "";
  return text || null;
}

async function lookup(placeId: string): Promise<string | null> {
  if (DEMO) return DEMO_GOOGLE_NAMES[placeId] ?? null;
  const key = googleKey();
  if (!key) return null;
  try {
    const res = await fetch(`${DETAILS_URL}${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELDS },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn("Google Place Details failed:", res.status);
      return null;
    }
    await countGoogleCall(DETAILS_SKU);
    return parseDisplayName(await res.json());
  } catch (err) {
    console.warn("Google Place Details failed:", (err as Error).message);
    return null;
  }
}

// One lookup per place ID per render.
export const googlePlaceName = cache(lookup);

// The spots with their Google names filled in (`google`), for the spots tagged with a Google place. On
// any failure `google` stays null and the row shows the safe name (the area, or whatever else names it).
export async function withGoogleNames<T extends SpotName>(spots: readonly T[]): Promise<T[]> {
  const ids = [...new Set(spots.flatMap((s) => (s.target.tag?.googlePlaceId ? [s.target.tag.googlePlaceId] : [])))].slice(0, MAX_LOOKUPS);
  if (ids.length === 0) return [...spots];
  const names = new Map(await Promise.all(ids.map(async (id) => [id, await googlePlaceName(id)] as const)));
  return spots.map((s) => {
    const id = s.target.tag?.googlePlaceId;
    const google = id ? (names.get(id) ?? null) : null;
    return google ? { ...s, google } : s;
  });
}

// The same, for spots keyed by a session id or a stretch's start.
export async function withGoogleNamesBy<K extends string | number, T extends SpotName>(spots: Readonly<Record<K, T>>): Promise<Record<K, T>> {
  const entries = Object.entries(spots) as [K, T][];
  const named = await withGoogleNames(entries.map(([, s]) => s));
  return Object.fromEntries(entries.map(([k], i) => [k, named[i]])) as Record<K, T>;
}
