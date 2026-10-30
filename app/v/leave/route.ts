import { NextResponse } from "next/server";
import { browserUrl } from "@/lib/session";
import { expireGuestHintHeader, expirePendingHeader, expireViewCookieHeader, VIEWER_HEADERS } from "@/lib/view-cookie";

// A guest's Exit (components/viewer-bar.tsx): the viewer cookie and its companions go, then the home page.
export async function GET(request: Request) {
  const res = NextResponse.redirect(browserUrl("/home", request), 303);
  for (const [name, value] of Object.entries(VIEWER_HEADERS)) res.headers.set(name, value);
  res.headers.append("set-cookie", expireViewCookieHeader());
  res.headers.append("set-cookie", expireGuestHintHeader());
  res.headers.append("set-cookie", expirePendingHeader());
  return res;
}
