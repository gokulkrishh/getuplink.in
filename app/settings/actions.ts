"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { createConnectorToken, revokeConnectorToken } from "@/lib/server/connector-token";
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
  if (DEMO) redirect("/settings");
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
  if (DEMO) redirect("/settings");
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
  if (DEMO) redirect("/settings");
  try {
    await deleteMyData();
  } catch (err) {
    console.error("Delete failed:", messageOf(err));
    return "Couldn't delete your data. Try again in a moment.";
  }
  await endHere();
  return null;
}

export type TokenResult = { token: string | null; error: string | null };

// A new connector token, shown once. Any old one stops working.
export async function newConnectorToken(): Promise<TokenResult> {
  await requireSession();
  if (DEMO) return { token: null, error: "Tokens aren't available in demo mode." };
  try {
    const token = await createConnectorToken();
    updateTag(OWNER_DATA_TAG);
    return { token, error: null };
  } catch (err) {
    console.error("Creating the connector token failed:", messageOf(err));
    return { token: null, error: "Couldn't create a token. Try again in a moment." };
  }
}

export async function removeConnectorToken(): Promise<TokenResult> {
  await requireSession();
  if (DEMO) return { token: null, error: null };
  try {
    await revokeConnectorToken();
    updateTag(OWNER_DATA_TAG);
    return { token: null, error: null };
  } catch (err) {
    console.error("Revoking the connector token failed:", messageOf(err));
    return { token: null, error: "Couldn't revoke the token. Try again in a moment." };
  }
}
