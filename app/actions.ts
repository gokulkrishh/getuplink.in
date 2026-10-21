"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function checkNow() {
  // Server actions are reachable by POST from anywhere, so re-check the session.
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) redirect("/login");
  const result = await pollAll().catch((err: Error) => ({ ok: false, error: err.message }));
  redirect(result.ok ? "/" : `/?error=${encodeURIComponent(result.error ?? "Check failed")}`);
}
