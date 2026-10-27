"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { clearSession, isValidSession, requestHost, SESSION_COOKIE, SESSION_MAX_AGE, sessionClaims } from "@/lib/session";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { signOutSession } from "@/lib/server/data/system";

export async function logout() {
  const jar = await cookies();
  // The server forgets this session too, so a copy of the cookie stops working. Only a cookie Uplink
  // signed can name a session to end.
  const cookie = jar.get(SESSION_COOKIE)?.value;
  const claims = !DEMO && (await isValidSession(cookie)) ? sessionClaims(cookie) : null;
  if (claims) {
    await signOutSession(claims.userId, claims.issuedAt, Date.now() - SESSION_MAX_AGE * 1000).catch((err: Error) =>
      console.warn("Ending the session on the server failed:", err.message),
    );
  }
  clearSession(jar, requestHost(await headers()));
  // Deleting the cookie alone keeps the router's cached pages, so the next person to sign in on this
  // browser could see them. Drop them, and the private cache entries, before leaving.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  redirect("/home");
}
