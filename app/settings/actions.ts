"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { importPastUpdates, removeImportedUpdates } from "@/lib/server/import-updates";
import type { ImportState } from "@/lib/import-updates";
import { deleteMyData, disconnectTesla, revokeAllSessions } from "@/lib/server/tesla";
import { messageOf } from "@/lib/errors";
import { clearSession, requestHost } from "@/lib/session";

// Server actions are reachable by POST from anywhere, so each one re-checks the session.
async function requireSession() {
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
}

async function endHere() {
  // The pages' private cache entries and the browser's cached copies still hold the old data and
  // session; drop them so nothing is shown from before the change.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  clearSession(await cookies(), requestHost(await headers()));
  redirect("/home");
}

// For useActionState: returns the error to show, or redirects.
export async function signOutEverywhereWithError(): Promise<string | null> {
  await requireSession();
  try {
    await revokeAllSessions();
  } catch (err) {
    console.error("Sign out everywhere failed:", messageOf(err));
    return "Couldn't sign out everywhere. Try again in a moment.";
  }
  await endHere();
  return null;
}

// Plain form action kept for pages that don't show the error inline; a failure surfaces on the error page.
export async function disconnect(): Promise<string | null> {
  await requireSession();
  try {
    await disconnectTesla();
  } catch (err) {
    console.error("Disconnect failed:", messageOf(err));
    return "Couldn't disconnect. Try again in a moment.";
  }
  await endHere();
  return null;
}

export async function deleteEverything(_: string | null, form: FormData): Promise<string | null> {
  await requireSession();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") return "Type delete to confirm.";
  try {
    await deleteMyData();
  } catch (err) {
    console.error("Delete failed:", messageOf(err));
    return "Couldn't delete your data. Try again in a moment.";
  }
  await endHere();
  return null;
}

// Two steps in one action: "preview" checks the pasted list, "import" checks it again and saves.
export async function importUpdates(_: ImportState, form: FormData): Promise<ImportState> {
  await requireSession();
  const confirmed = form.get("intent") === "import";
  try {
    const result = await importPastUpdates(String(form.get("vehicle") ?? ""), String(form.get("text") ?? ""), confirmed);
    if (result.status === "done") updateTag(OWNER_DATA_TAG);
    return result;
  } catch (err) {
    console.error("Import failed:", messageOf(err));
    return { status: "error", message: "Couldn't import the updates. Try again in a moment.", issues: [], count: 0 };
  }
}

export async function deleteImportedUpdates(): Promise<string | null> {
  await requireSession();
  try {
    await removeImportedUpdates();
  } catch (err) {
    console.error("Deleting imported updates failed:", messageOf(err));
    return "Couldn't delete the imported updates. Try again in a moment.";
  }
  updateTag(OWNER_DATA_TAG);
  return null;
}
