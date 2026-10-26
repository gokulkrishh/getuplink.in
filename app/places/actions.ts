"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { NO_SUGGESTIONS, type Suggestions } from "@/lib/place-suggestions";
import { currentOwner, type Owner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { googlePlaceName } from "@/lib/server/google-place-names";
import { suggestionsAt } from "@/lib/server/place-suggestions";
import { googleTapReady, loadUserPlaces, type PlaceLabel, removeUserPlace, type SaveInput, saveUserPlace } from "@/lib/server/user-places";
import { parseId, parseName, parsePlaceId, parsePoint } from "@/lib/user-places";

// "Name this place". Server actions are reachable by POST from anywhere, so each one re-checks the
// session, checks every input, and acts only on the signed-in owner's rows (through
// lib/server/user-places, which goes through ownerDb).

async function requireSession(): Promise<Owner> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return owner;
}

// The sheet's suggestions for one spot, and, for a tag that is a Google place, that place's live name.
// The only place Google's search is called, and only when the sheet opens.
export async function placeSuggestions(lat: number, lng: number, tagId?: number): Promise<Suggestions> {
  const owner = await requireSession();
  const point = parsePoint(lat, lng);
  if (!point) return NO_SUGGESTIONS;
  try {
    const id = tagId === undefined ? null : parseId(tagId);
    const [found, tappable, tags] = await Promise.all([suggestionsAt(point), googleTapReady(owner), id === null ? [] : loadUserPlaces(owner)]);
    // Only the owner's own tag is looked up, never an ID from the browser.
    const placeId = tags.find((t) => t.id === id)?.googlePlaceId ?? null;
    const current = placeId ? await googlePlaceName(placeId) : null;
    return { ...found, tappable, current };
  } catch (err) {
    console.warn("Place suggestions failed:", (err as Error).message);
    return NO_SUGGESTIONS;
  }
}

// For useActionState: the error to show, or null once saved. A new tag needs lat and lng; a rename, the
// tag's id. The tag is named by the typed name, or by `googlePlaceId` when a Google place was tapped: its
// ID only, never its name.
export async function savePlace(_: string | null, form: FormData): Promise<string | null> {
  const owner = await requireSession();
  const rawPlace = form.get("googlePlaceId");
  let label: PlaceLabel;
  if (rawPlace !== null && rawPlace !== "") {
    const googlePlaceId = parsePlaceId(rawPlace);
    if (!googlePlaceId) return "That place isn't known.";
    label = { googlePlaceId };
  } else {
    const name = parseName(form.get("name"));
    if (!name) return "Give it a name, up to 60 characters.";
    label = { name };
  }
  const rawId = form.get("id");
  let input: SaveInput;
  if (rawId !== null && rawId !== "") {
    const id = parseId(rawId);
    if (id === null) return "That place is gone.";
    input = { kind: "rename", id, label };
  } else {
    const point = parsePoint(form.get("lat"), form.get("lng"));
    if (!point) return "That spot isn't known.";
    input = { kind: "new", point, label };
  }
  // Whether google_place_id exists: a Google save needs it, and a typed rename clears it.
  const result = await saveUserPlace(owner, input, await googleTapReady(owner));
  if (!result.ok) return result.error;
  // Every page reads behind this tag; the name shows at once.
  updateTag(OWNER_DATA_TAG);
  return null;
}

export async function removePlace(_: string | null, form: FormData): Promise<string | null> {
  const owner = await requireSession();
  const id = parseId(form.get("id"));
  if (id === null) return "That place is gone.";
  const result = await removeUserPlace(owner, id);
  if (!result.ok) return result.error;
  updateTag(OWNER_DATA_TAG);
  return null;
}
