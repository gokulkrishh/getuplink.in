"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearSession, requestHost } from "@/lib/session";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";

export async function logout() {
  clearSession(await cookies(), requestHost(await headers()));
  // Deleting the cookie alone keeps the router's cached pages, so the next person to sign in on this
  // browser could see them. Drop them, and the private cache entries, before leaving.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  redirect("/home");
}
