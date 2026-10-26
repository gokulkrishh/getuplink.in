"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { NO_SUGGESTIONS, type Suggestions } from "@/lib/place-suggestions";
import { currentOwner, type Owner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { suggestionsAt } from "@/lib/server/place-suggestions";
import { removeUserPlace, type SaveInput, saveUserPlace } from "@/lib/server/user-places";
import { parseId, parseName, parsePoint } from "@/lib/user-places";

// "Name this place" and Your places. Server actions are reachable by POST from anywhere, so each one
// re-checks the session, checks every input, and acts only on the signed-in owner's rows (through
// lib/server/user-places, which goes through ownerDb).

async function requireSession(): Promise<Owner> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return owner;
}

// The sheet's suggestions for one spot. The only place Google is called, and only when the sheet opens.
export async function placeSuggestions(lat: number, lng: number): Promise<Suggestions> {
  await requireSession();
  const point = parsePoint(lat, lng);
  if (!point) return NO_SUGGESTIONS;
  try {
    return await suggestionsAt(point);
  } catch (err) {
    console.warn("Place suggestions failed:", (err as Error).message);
    return NO_SUGGESTIONS;
  }
}

// For useActionState: the error to show, or null once saved. A new tag needs lat and lng; a rename, the
// tag's id. The name is always the one in the field: Google's suggestions are never sent back.
export async function savePlace(_: string | null, form: FormData): Promise<string | null> {
  const owner = await requireSession();
  const name = parseName(form.get("name"));
  if (!name) return "Give it a name, up to 60 characters.";
  const rawId = form.get("id");
  let input: SaveInput;
  if (rawId !== null && rawId !== "") {
    const id = parseId(rawId);
    if (id === null) return "That place is gone.";
    input = { kind: "rename", id, name };
  } else {
    const point = parsePoint(form.get("lat"), form.get("lng"));
    if (!point) return "That spot isn't known.";
    input = { kind: "new", point, name };
  }
  const result = await saveUserPlace(owner, input);
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
