import { NextResponse, type NextRequest } from "next/server";
import { createSession, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE } from "@/lib/session";
import { pollAll } from "@/lib/server/poll";
import { signIn, type SignInResult } from "@/lib/server/tesla";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";

  const done = (path: string, error?: string) => {
    const url = new URL(path, request.url);
    if (error) url.searchParams.set("error", error);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };

  if (params.get("error")) return done("/login", params.get("error_description") ?? params.get("error")!);
  if (!code || !expected || !safeEqual(state, expected)) return done("/login", "Sign-in expired, try again");

  let result: SignInResult;
  try {
    result = await signIn(code);
  } catch (err) {
    console.error(err);
    return done("/login", "Could not complete Sign in with Tesla");
  }
  if (result === "not-owner") return done("/login", "This Tesla account is not the owner of this dashboard");

  // First sign-in: record a snapshot right away rather than waiting for the cron.
  if (result === "claimed") await pollAll().catch((err) => console.error(err));

  const res = done("/");
  res.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
