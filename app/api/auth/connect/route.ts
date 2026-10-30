import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo";
import { browserUrl, STATE_COOKIE } from "@/lib/session";
import { authorizeUrl } from "@/lib/server/tesla";

export async function GET(request: Request) {
  // Demo mode has no Tesla to sign in with.
  if (DEMO) return NextResponse.redirect(browserUrl("/", request));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
