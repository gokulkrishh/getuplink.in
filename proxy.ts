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
  "/privacy", // public legal pages, served on both hosts
  "/terms",
]);

// The bare domain serves the public home page; every other path there goes to the app.
// Locally the same split runs on uplink.localhost (home) and app.uplink.localhost (dashboard), which can
// share the session cookie like getuplink.in does. Plain localhost (Tesla's local redirect URI) forwards there.
const MARKETING_HOSTS = new Set(["getuplink.in", "www.getuplink.in", "uplink.localhost", "localhost"]);
const MARKETING_PATHS = new Set(["/home", "/privacy", "/terms", "/favicon.ico", "/icon.svg"]);
const APP_ORIGIN = "https://app.getuplink.in";

function appOrigin(url: URL): string {
  const local = url.hostname === "localhost" || url.hostname === "uplink.localhost";
  return local ? `${url.protocol}//app.uplink.localhost${url.port ? `:${url.port}` : ""}` : APP_ORIGIN;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host")?.split(":")[0];
  const marketing = Boolean(host && MARKETING_HOSTS.has(host));
  // "Open app" on the home page: the dashboard root on the app host.
  if (pathname === "/app") {
    return NextResponse.redirect(marketing ? appOrigin(request.nextUrl) + "/" : new URL("/", request.url));
  }
  if (marketing) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/home", request.url));
    if (!MARKETING_PATHS.has(pathname)) return NextResponse.redirect(appOrigin(request.nextUrl) + pathname + search, 308);
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const signedIn = DEMO || (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value));

  if (signedIn) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Signed out: the home page, where "Sign in with Tesla" starts.
  return NextResponse.redirect(new URL("/home", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
