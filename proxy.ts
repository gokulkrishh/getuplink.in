import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

// Public: login and the Tesla sign-in flow, Tesla's public key, the cron endpoint (it checks CRON_SECRET) and static assets.
export const config = {
  matcher: [
    "/((?!login|api/auth/connect|api/auth/callback|api/cron|api/public-key|\\.well-known|_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
  ],
};
