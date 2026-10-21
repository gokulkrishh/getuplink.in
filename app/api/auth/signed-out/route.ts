import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// A revoked session lands here: clear the cookie and go to the login page.
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/home", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
