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
import { adminOwner } from "@/lib/server/admin";
import { endViewLink, makeViewLink, setViewLinkHideLocations, viewLinkTokenAgain } from "@/lib/server/view-links";
import { VIEW_LINK_LABEL_MAX, type ViewLinkHides } from "@/lib/view-links";

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

// ---- View links (Settings → View links), the admin's alone for now ----

export type MakeViewLinkResult = { label: string; token: string } | { error: string };

const VIEW_LINK_REFUSED = {
  label: `Say who it's for, in up to ${VIEW_LINK_LABEL_MAX} characters.`,
  length: "Choose how long the link lasts.",
  limit: "End a link to make another.",
  unavailable: "Guest access isn't set up yet.",
  hides: "Choose whether the link hides locations.",
  demo: "The demo can't make guest links.",
  trust: "Tick the box to confirm you trust this person.",
} as const;

// A new view link and its token (Copy link rebuilds it later). Only for the admin while view links are tried out.
// `hides`: whether the link hides locations, changeable later from its row.
export async function makeViewLinkAction(rawLabel: string, length: string, trusted: boolean, hides: ViewLinkHides): Promise<MakeViewLinkResult> {
  await requireSession();
  const admin = await adminOwner();
  if (!admin) return { error: "Only the admin can make guest links for now." };
  if (trusted !== true) return { error: VIEW_LINK_REFUSED.trust };
  try {
    const result = await makeViewLink(admin, rawLabel, length, Date.now(), hides);
    if ("refused" in result) return { error: VIEW_LINK_REFUSED[result.refused] };
    updateTag(OWNER_DATA_TAG);
    return { label: result.link.label, token: result.token };
  } catch (err) {
    console.error("Making a view link failed:", messageOf(err));
    return { error: "Couldn't make the link. Try again in a moment." };
  }
}

// Hide locations on or off for one of the owner's open guest links; the guest sees the change on their next
// page or within half a minute (ViewLinkWatch). Returns an error to show, or null.
export async function setViewLinkHideLocationsAction(id: number, hide: boolean): Promise<string | null> {
  const owner = await requireSession();
  if (DEMO) return "The demo can't change guest links.";
  if (!Number.isSafeInteger(id) || id < 1 || typeof hide !== "boolean") return "Couldn't change the link. Reload the page and try again.";
  try {
    if (!(await setViewLinkHideLocations(owner, id, hide, Date.now()))) return "This link has ended. Reload the page.";
    updateTag(OWNER_DATA_TAG);
    return null;
  } catch (err) {
    console.error("Changing a view link failed:", messageOf(err));
    return "Couldn't change the link. Try again in a moment.";
  }
}

// Copy link on one of the owner's open guest links: its token again, rebuilt on the server (the key never
// leaves it). Another owner's link, or an ended one, gives nothing. A token is never logged.
export async function copyViewLinkAction(id: number): Promise<{ token: string } | { error: string }> {
  const owner = await requireSession();
  if (DEMO) return { error: "The demo can't copy guest links." };
  if (!Number.isSafeInteger(id) || id < 1) return { error: "Couldn't copy the link. Reload the page and try again." };
  try {
    const token = await viewLinkTokenAgain(owner, id, Date.now());
    // Ended since the page loaded, or made before links could be copied again.
    return token ? { token } : { error: "This link can't be copied. Reload the page, or end it and make a new one." };
  } catch (err) {
    console.error("Copying a view link failed:", messageOf(err));
    return { error: "Couldn't copy the link. Try again in a moment." };
  }
}

// Ends one of the owner's view links at once. Returns an error to show, or null.
export async function endViewLinkAction(id: number): Promise<string | null> {
  const owner = await requireSession();
  if (DEMO) return "The demo can't end guest links.";
  if (!Number.isSafeInteger(id) || id < 1) return "Couldn't end the link. Reload the page and try again.";
  try {
    await endViewLink(owner, id, Date.now());
    updateTag(OWNER_DATA_TAG);
    return null;
  } catch (err) {
    console.error("Ending a view link failed:", messageOf(err));
    return "Couldn't end the link. Try again in a moment.";
  }
}
