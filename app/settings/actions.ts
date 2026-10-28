"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { currentOwner, type Owner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { CONNECTOR_LIMIT, CONNECTOR_NAME_MAX } from "@/lib/connectors";
import { createConnector, removeConnector } from "@/lib/server/connector-token";
import { deleteAccount, deleteMyData, disconnectTesla, revokeAllSessions } from "@/lib/server/tesla";
import { messageOf } from "@/lib/errors";
import { clearSession, requestHost } from "@/lib/session";

// Server actions are reachable by POST from anywhere, so each one re-checks the session, and acts only on
// the account it belongs to.
async function requireSession(): Promise<Owner> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  return owner;
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
  const owner = await requireSession();
  if (DEMO) redirect("/settings");
  try {
    await revokeAllSessions(owner);
  } catch (err) {
    console.error("Sign out everywhere failed:", messageOf(err));
    return "Couldn't sign out everywhere. Try again in a moment.";
  }
  await endHere();
  return null;
}

// Plain form action kept for pages that don't show the error inline; a failure surfaces on the error page.
export async function disconnect(): Promise<string | null> {
  const owner = await requireSession();
  if (DEMO) redirect("/settings");
  try {
    await disconnectTesla(owner);
  } catch (err) {
    console.error("Disconnect failed:", messageOf(err));
    return "Couldn't disconnect. Try again in a moment.";
  }
  await endHere();
  return null;
}

export async function deleteEverything(_: string | null, form: FormData): Promise<string | null> {
  const owner = await requireSession();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") return "Type delete to confirm.";
  if (DEMO) redirect("/settings");
  try {
    await deleteMyData(owner);
  } catch (err) {
    console.error("Delete failed:", messageOf(err));
    return "Couldn't delete your data. Try again in a moment.";
  }
  await endHere();
  return null;
}

export async function deleteWholeAccount(_: string | null, form: FormData): Promise<string | null> {
  const owner = await requireSession();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete account") return "Type delete account to confirm.";
  if (DEMO) redirect("/settings");
  try {
    await deleteAccount(owner);
  } catch (err) {
    console.error("Deleting the account failed:", messageOf(err));
    return "Couldn't delete your account. Try again in a moment.";
  }
  await endHere();
  return null;
}

export type AddConnectorResult = { name: string; token: string } | { error: string };

const REFUSED = {
  name: `Give it a name of up to ${CONNECTOR_NAME_MAX} characters.`,
  limit: `You have ${CONNECTOR_LIMIT} connectors. Remove one to add another.`,
} as const;

// A new named connector; its token is in the result this once.
export async function addConnector(rawName: string): Promise<AddConnectorResult> {
  const owner = await requireSession();
  if (DEMO) return { error: "The demo can't add connectors." };
  try {
    const result = await createConnector(owner, rawName);
    if ("refused" in result) return { error: REFUSED[result.refused] };
    updateTag(OWNER_DATA_TAG);
    return { name: rawName.trim(), token: result.token };
  } catch (err) {
    console.error("Adding a connector failed:", messageOf(err));
    return { error: "Couldn't add the connector. Try again in a moment." };
  }
}

// Removes one of the account's connectors. Returns an error to show, or null.
export async function deleteConnector(id: number): Promise<string | null> {
  const owner = await requireSession();
  if (DEMO) return "The demo can't remove connectors.";
  if (!Number.isSafeInteger(id) || id < 1) return "Couldn't remove the connector. Reload the page and try again.";
  try {
    await removeConnector(owner, id);
    updateTag(OWNER_DATA_TAG);
    return null;
  } catch (err) {
    console.error("Removing a connector failed:", messageOf(err));
    return "Couldn't remove the connector. Try again in a moment.";
  }
}
