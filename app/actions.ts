"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function checkNow() {
  if (DEMO) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    redirect("/");
  }
  // Server actions are reachable by POST from anywhere, so re-check the session.
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  // A failed run is recorded in poll_runs and shown on the dashboard; only a crash
  // before that (e.g. the database is unreachable) needs the ?error banner.
  const crashed = await pollAll().then(
    () => null,
    (err: Error) => err.message,
  );
  if (crashed) console.error(crashed);
  redirect(crashed ? "/?error=check" : "/");
}
