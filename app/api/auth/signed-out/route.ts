import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/lib/session";

// A revoked session lands here: clear the cookie and go to the home page.
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/home", request.url));
  clearSession(res.cookies, request.headers.get("host"));
  return res;
}
