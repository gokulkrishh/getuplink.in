"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { SESSION_COOKIE } from "@/lib/session";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { pollAll } from "@/lib/server/poll";

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  // Deleting the cookie alone keeps the router's cached pages, so the next person to sign in on this
  // browser could see them. Drop them, and the private cache entries, before leaving.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  redirect("/home");
}

export async function checkNow() {
  if (DEMO) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    redirect("/");
  }
  // Server actions are reachable by POST from anywhere, so re-check the session (including revocation).
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // A failed run is recorded in poll_runs and shown on the dashboard; only a crash
  // before that (e.g. the database is unreachable) needs the ?error banner.
  const crashed = await pollAll().then(
    () => null,
    (err: Error) => err.message,
  );
  if (crashed) console.error(crashed);
  // New data may change every page (dashboard, stats, settings); drop the private cache entries and
  // the browser's cached copies so the redirect renders fresh.
  updateTag(OWNER_DATA_TAG);
  revalidatePath("/", "layout");
  redirect(crashed ? "/?error=check" : "/");
}
