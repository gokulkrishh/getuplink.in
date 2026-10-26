import "server-only";
import { DEMO } from "@/lib/demo";
import { type LatLng, TAG_RADIUS_M, type UserPlace } from "@/lib/user-places";
import { type Owner, ownerDb } from "./data/owner";

// The owner's names for spots, in user_places. Every read and write goes through ownerDb, so it is the
// signed-in owner's rows only (user_id; see ownerKeys). A row holds a typed name or a Google place ID,
// never both (docs/place-names.md).

// Postgres 42P01 / PostgREST PGRST205: the migration hasn't run, so there are no tags yet.
const MISSING_TABLE = ["42P01", "PGRST205"];
// Postgres 42703 (a select) / PostgREST PGRST204 (a write): google_place_id isn't there yet
// (20261103140000_user_places_google_id.sql hasn't run), so Google suggestions can't be tapped.
const MISSING_COLUMN = ["42703", "PGRST204"];
// More than anyone names; a cap so a page never reads an unbounded list.
export const MAX_TAGS = 500;

// Made-up tags for the demo car's spots (see lib/server/demo), so its pages show names the owner gave:
// two typed, and one tapped from Google (its name comes from DEMO_GOOGLE_NAMES, without a call).
export const DEMO_TAGS: UserPlace[] = [
  { id: 1, name: "Juniper Café", googlePlaceId: null, lat: 12.9784, lng: 77.6408, radiusM: TAG_RADIUS_M },
  { id: 2, name: "Cedar Park", googlePlaceId: null, lat: 13.0358, lng: 77.597, radiusM: TAG_RADIUS_M },
  { id: 3, name: null, googlePlaceId: "DemoPlace_OrchardLane01", lat: 12.9698, lng: 77.75, radiusM: TAG_RADIUS_M },
];

type Row = { id: number; name: string | null; google_place_id?: string | null; lat: number; lng: number; radius_m: number };
const fromRow = (r: Row): UserPlace => ({
  id: Number(r.id),
  name: r.name ?? null,
  googlePlaceId: r.google_place_id ?? null,
  lat: Number(r.lat),
  lng: Number(r.lng),
  radiusM: Number(r.radius_m),
});

// The owner's tags, newest first. Never throws: before the migration, or on an error, there are none.
// "*" so the read works before and after google_place_id exists.
export async function loadUserPlaces(owner: Owner): Promise<UserPlace[]> {
  if (DEMO) return DEMO_TAGS;
  try {
    const { data, error } = await ownerDb(owner).from("user_places").select("*").order("updated_at", { ascending: false }).limit(MAX_TAGS);
    if (error) {
      if (!MISSING_TABLE.includes(error.code)) console.warn("Saved places unavailable:", error.message);
      return [];
    }
    // A row with neither (impossible once the check constraint is in) names nothing.
    return ((data ?? []) as Row[]).map(fromRow).filter((t) => t.name || t.googlePlaceId);
  } catch (err) {
    console.warn("Saved places unavailable:", (err as Error).message);
    return [];
  }
}

// Whether a Google suggestion can be tapped: google_place_id exists. Asked when the sheet opens.
export async function googleTapReady(owner: Owner): Promise<boolean> {
  if (DEMO) return true;
  try {
    const { error } = await ownerDb(owner).from("user_places").select("google_place_id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };
const NOT_YET: SaveResult = { ok: false, error: "Naming places isn't ready yet. Try again later." };
const FAILED: SaveResult = { ok: false, error: "Couldn't save. Try again in a moment." };
const failed = (error: { code?: string; message: string }): SaveResult => {
  if (MISSING_TABLE.includes(error.code ?? "") || MISSING_COLUMN.includes(error.code ?? "")) return NOT_YET;
  console.error("Saving a place failed:", error.message);
  return FAILED;
};

// What names the tag: a typed name, or a Google place ID (nothing else from Google).
export type PlaceLabel = { name: string } | { googlePlaceId: string };

// A new tag at the point, or, with `id`, a new name for one of the owner's tags. The radius is set here,
// never by the browser.
export type SaveInput = { label: PlaceLabel } & ({ kind: "new"; point: LatLng } | { kind: "rename"; id: number });

// The columns a label writes. A typed name leaves google_place_id out, so typing works before the
// migration; a rename writes both, so a row switches cleanly between the two.
function columns(label: PlaceLabel, rename: boolean): Record<string, string | null> {
  if ("googlePlaceId" in label) return { name: null, google_place_id: label.googlePlaceId };
  return rename ? { name: label.name, google_place_id: null } : { name: label.name };
}

export async function saveUserPlace(owner: Owner, input: SaveInput, googleReady = true): Promise<SaveResult> {
  if (DEMO) return { ok: false, error: "The demo doesn't save names." };
  if ("googlePlaceId" in input.label && !googleReady) return NOT_YET;
  const now = new Date().toISOString();
  const scope = ownerDb(owner).from("user_places");
  if (input.kind === "rename") {
    // Before the migration a typed rename writes only the name.
    const patch = googleReady ? columns(input.label, true) : columns(input.label, false);
    // Filtered to the owner's rows, so another user's id finds nothing and changes nothing.
    const { data, error } = await scope.update({ ...patch, updated_at: now }).eq("id", input.id).select("id");
    if (error) return failed(error);
    return (data ?? []).length > 0 ? { ok: true } : { ok: false, error: "That place is gone." };
  }
  const { error } = await scope.insert({
    ...columns(input.label, false),
    lat: input.point.lat,
    lng: input.point.lng,
    radius_m: TAG_RADIUS_M,
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
