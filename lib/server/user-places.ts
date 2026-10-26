import "server-only";
import { DEMO } from "@/lib/demo";
import { type LatLng, TAG_RADIUS_M, type UserPlace } from "@/lib/user-places";
import { type Owner, ownerDb } from "./data/owner";

// Your places: the owner's names for spots, in user_places. Every read and write goes through ownerDb, so
// it is the signed-in owner's rows only (user_id; see ownerKeys).

// Postgres 42P01 / PostgREST PGRST205: the migration hasn't run, so there are no tags yet.
const MISSING_TABLE = ["42P01", "PGRST205"];
// More than anyone names; a cap so a page never reads an unbounded list.
export const MAX_TAGS = 500;

// Made-up tags for the demo car's spots (see lib/server/demo), so its pages show names the owner gave.
export const DEMO_TAGS: UserPlace[] = [
  { id: 1, name: "Juniper Café", lat: 12.9784, lng: 77.6408, radiusM: TAG_RADIUS_M, googlePlaceId: null },
  { id: 2, name: "Cedar Park", lat: 13.0358, lng: 77.597, radiusM: TAG_RADIUS_M, googlePlaceId: null },
];

type Row = { id: number; name: string; lat: number; lng: number; radius_m: number; google_place_id: string | null };
const fromRow = (r: Row): UserPlace => ({ id: Number(r.id), name: r.name, lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m), googlePlaceId: r.google_place_id ?? null });

// The owner's tags, newest first. Never throws: before the migration, or on an error, there are none.
export async function loadUserPlaces(owner: Owner): Promise<UserPlace[]> {
  if (DEMO) return DEMO_TAGS;
  try {
    const { data, error } = await ownerDb(owner)
      .from("user_places")
      .select("id, name, lat, lng, radius_m, google_place_id")
      .order("updated_at", { ascending: false })
      .limit(MAX_TAGS);
    if (error) {
      if (!MISSING_TABLE.includes(error.code)) console.warn("Your places unavailable:", error.message);
      return [];
    }
    return ((data ?? []) as Row[]).map(fromRow);
  } catch (err) {
    console.warn("Your places unavailable:", (err as Error).message);
    return [];
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };
const NOT_YET: SaveResult = { ok: false, error: "Naming places isn't ready yet. Try again later." };
const FAILED: SaveResult = { ok: false, error: "Couldn't save. Try again in a moment." };
const failed = (error: { code?: string; message: string }): SaveResult => {
  if (MISSING_TABLE.includes(error.code ?? "")) return NOT_YET;
  console.error("Saving a place failed:", error.message);
  return FAILED;
};

// A new tag at the point, or, with `id`, a new name for one of the owner's tags. The radius is set here,
// never by the browser. googlePlaceId: the Google suggestion the name came from, else null.
export type SaveInput = { name: string; googlePlaceId: string | null } & ({ kind: "new"; point: LatLng } | { kind: "rename"; id: number });

export async function saveUserPlace(owner: Owner, input: SaveInput): Promise<SaveResult> {
  if (DEMO) return { ok: false, error: "The demo doesn't save names." };
  const now = new Date().toISOString();
  const scope = ownerDb(owner).from("user_places");
  if (input.kind === "rename") {
    // Filtered to the owner's rows, so another user's id changes nothing.
    const { data, error } = await scope.update({ name: input.name, google_place_id: input.googlePlaceId, updated_at: now }).eq("id", input.id).select("id");
    if (error) return failed(error);
    return (data ?? []).length > 0 ? { ok: true } : { ok: false, error: "That place is gone." };
  }
  const { error } = await scope.insert({
    name: input.name,
    lat: input.point.lat,
    lng: input.point.lng,
    radius_m: TAG_RADIUS_M,
    google_place_id: input.googlePlaceId,
    created_at: now,
    updated_at: now,
  });
  return error ? failed(error) : { ok: true };
}

export async function removeUserPlace(owner: Owner, id: number): Promise<SaveResult> {
  if (DEMO) return { ok: false, error: "The demo doesn't save names." };
  const { error } = await ownerDb(owner).from("user_places").delete().eq("id", id);
  return error ? failed(error) : { ok: true };
}
