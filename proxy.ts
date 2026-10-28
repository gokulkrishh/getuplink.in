import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { EXPIRE_HOST_ONLY_SESSION, isValidSession, requestHost, SESSION_COOKIE, sessionCookieDomain, sessionCookieValues } from "@/lib/session";
import { METADATA_PATHS } from "@/lib/site";
import { statsRedirect } from "@/lib/stats-redirect";

// Exact paths reachable without a session. Anything not listed here needs one.
const PUBLIC_PATHS = new Set([
  "/api/auth/connect",
  "/api/auth/callback",
  "/api/auth/signed-out", // only clears the session cookie
  "/api/cron/poll", // checks CRON_SECRET itself
  "/api/cron/stations", // checks CRON_SECRET itself
  "/api/cron/retention", // checks CRON_SECRET itself
  "/api/cron/owners", // checks CRON_SECRET itself
  "/api/health/stream", // checks HEALTH_TOKEN itself
  "/api/mcp", // the MCP connector: checks its own token from Settings → Integrations
  "/api/public-key",
  "/.well-known/appspecific/com.tesla.3p.public-key.pem",
  ...METADATA_PATHS, // icons, the manifest and link preview images, on every host (lib/site.ts)
  "/home", // public marketing page, served on getuplink.in via the rewrite below
  "/waitlist", // where a sign-in that's waiting for approval lands; says the same to everyone
  "/privacy", // public legal pages, served on both hosts
  "/privacy/car-data",
  "/terms",
  "/status", // public status page, served on status.getuplink.in via the rewrite below
  "/agents.md", // what Uplink is and how an AI connects, served on both hosts
  "/robots.txt", // per host: crawlers may read the home page host's public pages only
]);

// The bare domain serves the public home page; every other path there goes to the app.
// Locally the same split runs on uplink.localhost (home) and app.uplink.localhost (dashboard), which can
// share the session cookie like getuplink.in does. Plain localhost (Tesla's local redirect URI) forwards there.
const MARKETING_HOSTS = new Set(["getuplink.in", "www.getuplink.in", "uplink.localhost", "localhost"]);
const MARKETING_PATHS = new Set(["/home", "/privacy", "/privacy/car-data", "/terms", "/status", "/agents.md", "/robots.txt", ...METADATA_PATHS]);
const APP_ORIGIN = "https://app.getuplink.in";

// The status page has its own host. It serves only /status, the icons and preview images; anything else goes to the home page host.
const STATUS_HOSTS = new Set(["status.getuplink.in", "status.uplink.localhost"]);
const STATUS_PATHS = new Set(["/status", "/robots.txt", ...METADATA_PATHS]);
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
    if (pathname === "/") {
      // Signed in: getuplink.in opens the dashboard (a temporary redirect, so signing out shows the home
      // page again). The home page itself stays at /home. Any valid cookie counts; see sessionCookieValues.
      for (const value of sessionCookieValues(request.headers.get("cookie"))) {
        if (await isValidSession(value)) return NextResponse.redirect(appOrigin(request.nextUrl) + "/");
      }
      return NextResponse.rewrite(new URL("/home", request.url));
    }
    if (!MARKETING_PATHS.has(pathname)) return NextResponse.redirect(appOrigin(request.nextUrl) + pathname + search, 308);
  }

  // Old Stats links (/stats?view=…) land on the page that has that topic now.
  if (pathname === "/stats") return NextResponse.redirect(new URL(statsRedirect(request.nextUrl.searchParams), request.url));

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  // Invite links (/invite/<token>): opened by someone without an account yet. The page checks the token itself.
  if (pathname.startsWith("/invite/")) return NextResponse.next();

  if (DEMO) return NextResponse.next();
  const sent = sessionCookieValues(request.headers.get("cookie"));
  let session: string | undefined;
  for (const value of sent) if (await isValidSession(value)) session = value;

  if (session && sent.length > 1) {
    // Pages read the cookie with cookies().get(), which may pick the stale duplicate: hand them only
    // the valid one, and drop the host-only cookie so the next request carries just the shared one.
    request.cookies.set(SESSION_COOKIE, session);
    const res = NextResponse.next({ request: { headers: request.headers } });
    if (sessionCookieDomain(host)) res.headers.append("set-cookie", EXPIRE_HOST_ONLY_SESSION);
    return res;
  }
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Signed out: the home page, where "Sign in with Tesla" starts.
  return NextResponse.redirect(new URL("/home", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
