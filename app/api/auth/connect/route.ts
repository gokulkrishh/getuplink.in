import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { STATE_COOKIE } from "@/lib/session";
import { authorizeUrl } from "@/lib/server/tesla";

export async function GET() {
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
