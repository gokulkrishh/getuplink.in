"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const passphrase = process.env.DASHBOARD_PASSPHRASE;
  if (!passphrase) return "DASHBOARD_PASSPHRASE is not set";
  const attempt = String(form.get("passphrase") ?? "");
  if (!safeEqual(await sessionToken(attempt), await sessionToken(passphrase))) return "Wrong passphrase";

  (await cookies()).set(SESSION_COOKIE, await sessionToken(passphrase), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

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
