import { NextResponse, type NextRequest } from "next/server";
import { browserUrl, clearSession, requestHost } from "@/lib/session";

// A revoked session lands here: clear the cookie and go to the home page.
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(browserUrl("/home", request));
  clearSession(res.cookies, requestHost(request.headers));
  return res;
}
