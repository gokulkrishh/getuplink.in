import { after, NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import type { LoginErrorCode } from "@/lib/login-errors";
import { createSession, EXPIRE_HOST_ONLY_SESSION, isValidSession, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, requestHost, sessionCookieDomain, STATE_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";
import { signIn, type SignInResult } from "@/lib/server/tesla";

// Room for the check that runs after the redirect, like the cron's.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (DEMO) return NextResponse.redirect(new URL("/", request.url));
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";

  // Redirect on the host the browser used (app.getuplink.in / app.localhost); request.url can carry the
  // server's own origin instead, which would land a freshly signed-in owner on the home page.
  const origin = `${request.nextUrl.protocol}//${requestHost(request.headers) ?? request.nextUrl.host}`;
  const done = (path: string, error?: LoginErrorCode) => {
    const url = new URL(path, origin);
    if (error) url.searchParams.set("error", error);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };

  if (params.get("error")) return done("/home", "denied");
  if (!code || !expected || !safeEqual(state, expected)) {
    // A repeat of a callback that already signed this browser in (double click, back, reload) finds
    // the one-time state cookie gone; that's not a failed sign-in.
    if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return done("/");
    return done("/home", "expired");
  }

  let result: SignInResult;
  try {
    result = await signIn(code);
  } catch (err) {
    console.error(err);
    return done("/home", "failed");
  }
  if (result === "not-owner") return done("/home", "not-owner");

  // Check with the new tokens right away rather than waiting for the cron: on a first sign-in this records
  // the first snapshot, and after a sign-in that replaced refused tokens it clears the failed run's
  // "sign in again". Runs after the redirect is sent, so sign-in isn't held up or failed by it.
  after(() => pollAll().catch((err) => console.error(err)));

  const res = done("/");
  const domain = sessionCookieDomain(requestHost(request.headers));
  res.cookies.set(SESSION_COOKIE, await createSession(result.userId), {
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // An older host-only cookie would shadow the new shared one in some browsers (see sessionCookieValues).
  // Appended last: the cookies API rewrites every set-cookie header when it changes.
  if (domain) res.headers.append("set-cookie", EXPIRE_HOST_ONLY_SESSION);
  return res;
}
