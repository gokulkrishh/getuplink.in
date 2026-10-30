import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";
import { browserUrl, EXPIRE_HOST_ONLY_SESSION, isValidSession, requestHost, SESSION_COOKIE, sessionCookieDomain, sessionCookieValues } from "@/lib/session";
import { METADATA_PATHS } from "@/lib/site";
import { expireGuestHintHeader, expirePendingHeader, expireViewCookieHeader, GUEST_HINT_COOKIE, guestHintHeader, VIEW_COOKIE, viewCookieClaims, VIEWER_HEADERS } from "@/lib/view-cookie";
import { isMissingStatsDetail } from "@/lib/stats-paths";
import { statsRedirect } from "@/lib/stats-redirect";

// Exact paths reachable without a session. Anything not listed here needs one.
const PUBLIC_PATHS = new Set([
  "/api/auth/connect",
  "/api/auth/callback",
  "/api/auth/signed-out", // only clears the session cookie
  "/api/cron/poll", // checks CRON_SECRET itself
  "/api/cron/stations", // checks CRON_SECRET itself
  "/api/cron/archive", // checks CRON_SECRET itself
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
  "/terms",
  "/status", // public status page, served on status.getuplink.in via the rewrite below
  "/agents.md", // what Uplink is and how an AI connects, served on both hosts
  "/robots.txt", // per host: crawlers may read the home page host's public pages only
  "/sitemap.xml", // the home page host's public pages, for search engines
]);

// The bare domain serves the public home page; every other path there goes to the app.
// Locally the same split runs on getuplink.localhost (home) and app.getuplink.localhost (dashboard), which can
// share the session cookie like getuplink.in does. Plain localhost (Tesla's local redirect URI) forwards there.
const MARKETING_HOSTS = new Set(["getuplink.in", "www.getuplink.in", "getuplink.localhost", "localhost"]);
const MARKETING_PATHS = new Set(["/home", "/privacy", "/terms", "/status", "/agents.md", "/robots.txt", "/sitemap.xml", ...METADATA_PATHS]);
const APP_ORIGIN = "https://app.getuplink.in";

// The status page has its own host. It serves only /status, the icons and preview images; anything else goes to the home page host.
const STATUS_HOSTS = new Set(["status.getuplink.in", "status.getuplink.localhost"]);
const STATUS_PATHS = new Set(["/status", "/robots.txt", ...METADATA_PATHS]);
const HOME_ORIGIN = "https://getuplink.in";

function homeOrigin(url: URL): string {
  return url.hostname.endsWith("localhost") ? `${url.protocol}//getuplink.localhost${url.port ? `:${url.port}` : ""}` : HOME_ORIGIN;
}

function statusOrigin(url: URL): string {
  return url.hostname.endsWith("localhost") ? `${url.protocol}//status.getuplink.localhost${url.port ? `:${url.port}` : ""}` : "https://status.getuplink.in";
}

function appOrigin(url: URL): string {
  const local = url.hostname === "localhost" || url.hostname === "getuplink.localhost";
  return local ? `${url.protocol}//app.getuplink.localhost${url.port ? `:${url.port}` : ""}` : APP_ORIGIN;
}

// The guest hint (lib/view-cookie.ts) only rides with a guest's own pages: any other response to a request
// that still carries it drops it, so an owner's page never makes room for a band it won't have.
function dropGuestHint(request: NextRequest, res: NextResponse): NextResponse {
  if (request.cookies.has(GUEST_HINT_COOKIE)) res.headers.append("set-cookie", expireGuestHintHeader());
  return res;
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
    return NextResponse.redirect(marketing ? appOrigin(request.nextUrl) + "/" : browserUrl("/", request));
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
  if (pathname === "/stats") return NextResponse.redirect(browserUrl(statsRedirect(request.nextUrl.searchParams), request));
  if (isMissingStatsDetail(pathname)) return NextResponse.rewrite(new URL("/__not-found", request.url));

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  // Invite links (/invite/<token>): opened by someone without an account yet. The page checks the token itself.
  if (pathname.startsWith("/invite/")) return NextResponse.next();
  // View links (/v/<token>, /v/status, /v/leave, /v/ended): opened by someone without an account. Each
  // checks the link itself. The ended page also drops the viewer cookie.
  if (pathname.startsWith("/v/")) {
    // The ended page answers 410 Gone, and drops every guest cookie this browser holds.
    const ended = pathname === "/v/ended";
    const res = ended ? NextResponse.rewrite(request.nextUrl, { status: 410 }) : NextResponse.next();
    for (const [name, value] of Object.entries(VIEWER_HEADERS)) res.headers.set(name, value);
    if (ended) {
      res.headers.append("set-cookie", expireViewCookieHeader());
      res.headers.append("set-cookie", expirePendingHeader());
      dropGuestHint(request, res);
    }
    return res;
  }

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
    return dropGuestHint(request, res);
  }
  if (session) return dropGuestHint(request, NextResponse.next());
  // A guest (someone the owner sent a view link): pages only, never /api/* (whose routes are the owner's,
  // invoice downloads included). The signature only, as for the session: pages re-read the link, so an
  // ended one goes to the ended page.
  const viewer = pathname.startsWith("/api/") ? null : await viewCookieClaims(request.cookies.get(VIEW_COOKIE)?.value);
  if (viewer) {
    const res = NextResponse.next();
    for (const [name, value] of Object.entries(VIEWER_HEADERS)) res.headers.set(name, value);
    // The hint for the page's first script, kept to the link's end (set again only when it isn't already).
    const hint = String(Math.floor(viewer.expiresAt / 1000));
    if (request.cookies.get(GUEST_HINT_COOKIE)?.value !== hint) res.headers.append("set-cookie", guestHintHeader(viewer.expiresAt, (viewer.expiresAt - Date.now()) / 1000));
    return res;
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Signed out: the home page, where "Sign in with Tesla" starts.
  return dropGuestHint(request, NextResponse.redirect(browserUrl("/home", request)));
}

// Font files (public/fonts, scripts/subset-fonts.py) are static and public like _next/static: every page on every
// host needs them, signed in or not, so they skip the proxy rather than being redirected.
export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/).*)"],
};
