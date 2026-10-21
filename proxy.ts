import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

// Exact paths reachable without a session. Anything not listed here needs one.
const PUBLIC_PATHS = new Set([
  "/api/auth/connect",
  "/api/auth/callback",
  "/api/auth/signed-out", // only clears the session cookie
  "/api/cron/poll", // checks CRON_SECRET itself
  "/api/public-key",
  "/.well-known/appspecific/com.tesla.3p.public-key.pem",
  "/favicon.ico",
  "/icon.svg",
  "/home", // public marketing page, served on getuplink.in via the rewrite below
]);

// The bare domain serves the public home page; every other path there goes to the app.
const MARKETING_HOSTS = new Set(["getuplink.in", "www.getuplink.in"]);
const MARKETING_PATHS = new Set(["/home", "/favicon.ico", "/icon.svg"]);
const APP_ORIGIN = "https://app.getuplink.in";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host")?.split(":")[0];
  if (host && MARKETING_HOSTS.has(host)) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/home", request.url));
    if (!MARKETING_PATHS.has(pathname)) return NextResponse.redirect(APP_ORIGIN + pathname + search, 308);
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const signedIn = DEMO || (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value));

  // /login is public, but a signed-in owner has nothing to do there.
  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
