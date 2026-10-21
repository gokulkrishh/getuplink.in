import { after, NextResponse, type NextRequest } from "next/server";
import type { LoginErrorCode } from "@/lib/login-errors";
import { createSession, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieDomain, STATE_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";
import { signIn, type SignInResult } from "@/lib/server/tesla";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";

  const done = (path: string, error?: LoginErrorCode) => {
    const url = new URL(path, request.url);
    if (error) url.searchParams.set("error", error);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };

  if (params.get("error")) return done("/home", "denied");
  if (!code || !expected || !safeEqual(state, expected)) return done("/home", "expired");

  let result: SignInResult;
  try {
    result = await signIn(code);
  } catch (err) {
    console.error(err);
    return done("/home", "failed");
  }
  if (result === "not-owner") return done("/home", "not-owner");

  // First sign-in: record a snapshot right away rather than waiting for the cron.
  // Runs after the redirect is sent, so sign-in isn't held up by it.
  if (result === "claimed") after(() => pollAll().catch((err) => console.error(err)));

  const res = done("/");
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    domain: sessionCookieDomain(request.headers.get("host")),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
