"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { deleteMyData, disconnectTesla, revokeAllSessions } from "@/lib/server/tesla";
import { SESSION_COOKIE } from "@/lib/session";

// Server actions are reachable by POST from anywhere, so each one re-checks the session.
async function requireSession() {
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
}

async function endHere() {
  // The pages' private cache entries and the browser's cached copies still hold the old data and
  // session; drop them so nothing is shown from before the change.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function signOutEverywhere() {
  await requireSession();
  if (DEMO) redirect("/settings");
  await revokeAllSessions();
  await endHere();
}

export async function disconnect() {
  await requireSession();
  if (DEMO) redirect("/settings");
  await disconnectTesla();
  await endHere();
}

export async function deleteEverything(_: string | null, form: FormData): Promise<string | null> {
  await requireSession();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") return "Type delete to confirm.";
  if (DEMO) redirect("/settings");
  await deleteMyData();
  await endHere();
  return null;
}
