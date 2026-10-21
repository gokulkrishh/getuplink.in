import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { isValidSession, requestHost, SESSION_COOKIE } from "@/lib/session";

// Exact paths reachable without a session. Anything not listed here needs one.
const PUBLIC_PATHS = new Set([
  "/api/auth/connect",
  "/api/auth/callback",
  "/api/auth/signed-out", // only clears the session cookie
  "/api/cron/poll", // checks CRON_SECRET itself
  "/api/health/stream", // checks HEALTH_TOKEN itself
  "/api/public-key",
  "/.well-known/appspecific/com.tesla.3p.public-key.pem",
  "/favicon.ico",
  "/icon.svg",
  "/home", // public marketing page, served on getuplink.in via the rewrite below
  "/privacy", // public legal pages, served on both hosts
  "/terms",
  "/status", // public status page, served on status.getuplink.in via the rewrite below
]);

// The bare domain serves the public home page; every other path there goes to the app.
// Locally the same split runs on uplink.localhost (home) and app.uplink.localhost (dashboard), which can
// share the session cookie like getuplink.in does. Plain localhost (Tesla's local redirect URI) forwards there.
const MARKETING_HOSTS = new Set(["getuplink.in", "www.getuplink.in", "uplink.localhost", "localhost"]);
const MARKETING_PATHS = new Set(["/home", "/privacy", "/terms", "/status", "/favicon.ico", "/icon.svg"]);
const APP_ORIGIN = "https://app.getuplink.in";

// The status page has its own host. It serves only /status and the icons; anything else goes to the home page host.
const STATUS_HOSTS = new Set(["status.getuplink.in", "status.uplink.localhost"]);
const STATUS_PATHS = new Set(["/status", "/favicon.ico", "/icon.svg"]);
const HOME_ORIGIN = "https://getuplink.in";

function homeOrigin(url: URL): string {
  return url.hostname.endsWith("localhost") ? `${url.protocol}//uplink.localhost${url.port ? `:${url.port}` : ""}` : HOME_ORIGIN;
}

function statusOrigin(url: URL): string {
  return url.hostname.endsWith("localhost") ? `${url.protocol}//status.uplink.localhost${url.port ? `:${url.port}` : ""}` : "https://status.getuplink.in";
}

function appOrigin(url: URL): string {
  const local = url.hostname === "localhost" || url.hostname === "uplink.localhost";
  return local ? `${url.protocol}//app.uplink.localhost${url.port ? `:${url.port}` : ""}` : APP_ORIGIN;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // The forwarded host first: Next renders a server action's redirect with an internal request to
  // localhost, which would otherwise be taken for the home page host.
  const host = requestHost(request.headers)?.split(":")[0];
  if (host && STATUS_HOSTS.has(host)) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/status", request.url));
    if (STATUS_PATHS.has(pathname)) return NextResponse.next();
    // The status page's "home" link points at /home.
    return NextResponse.redirect(homeOrigin(request.nextUrl) + (pathname === "/home" ? "/" : pathname + search), 308);
  }
  // Demo mode serves the app on any host, so plain localhost:3000 works.
  const marketing = !DEMO && Boolean(host && MARKETING_HOSTS.has(host));
  // Footer Status links, on the home page or in the app, land on the status subdomain.
  if (pathname === "/status" && !DEMO) return NextResponse.redirect(statusOrigin(request.nextUrl), 308);
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
