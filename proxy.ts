import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

// Public: login, Tesla's public key, the cron endpoint (it checks CRON_SECRET) and static assets.
export const config = {
  matcher: [
    "/((?!login|api/cron|api/public-key|\\.well-known|_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
  ],
};
