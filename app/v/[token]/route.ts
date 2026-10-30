import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { browserUrl, isValidSession, requestHost, SESSION_COOKIE, sessionCookieDomain, sessionCookieValues } from "@/lib/session";
import { createPendingCookie, expireSessionHeaders, pendingHeader, sameOrigin, VIEW_COOKIE, viewCookieClaims, VIEWER_HEADERS } from "@/lib/view-cookie";
import { LINK_ENDED_PATH } from "@/lib/server/auth";
import { isUsed, openViewLink, ViewLinksUnavailable } from "@/lib/server/view-links";
import type { ViewLinkRow } from "@/lib/server/data/view-links";

// A view link, opened (public in proxy.ts, like /invite/). An unknown, ended or expired link, or one before
// the migration, goes to the ended page. The token never leaves in a Referer.
//
// A link opens in one browser only. An open, unused link gives this browser the pending cookie and sends it
// to /v/open, whose script claims the link (/v/seen) and only then gets the viewer cookie. Nothing is used
// up here: a chat app's link preview fetches this too, but runs no script. A used link goes in only for the
// browser that claimed it (its viewer cookie names this link); any other browser gets the ended page.
//
// A guest and an owner never ride together in one browser, so becoming a guest drops any owner session on
// this host. When the request carries a signed owner session, GET doesn't: it asks first (./confirm), and only
// a same-origin POST from that page goes ahead.

type Params = { params: Promise<{ token: string }> };

function viewerRedirect(path: string, request: Request): NextResponse {
  const res = NextResponse.redirect(browserUrl(path, request), 303);
  for (const [name, value] of Object.entries(VIEWER_HEADERS)) res.headers.set(name, value);
  return res;
}

async function liveLink(token: string, now: number): Promise<ViewLinkRow | null> {
  try {
    return await openViewLink(token, now);
  } catch (err) {
    if (!(err instanceof ViewLinksUnavailable)) console.error("Opening a view link failed:", (err as Error).message);
    return null;
  }
}

// On the way to becoming a guest: the pending cookie until the link's end, and every owner session cookie
// on this host dropped, in one response. /v/open claims the link.
async function becomeGuest(link: ViewLinkRow, request: Request, now: number): Promise<NextResponse> {
  const res = viewerRedirect("/v/open", request);
  const expiresAt = Date.parse(link.expires_at);
  res.headers.append("set-cookie", pendingHeader(await createPendingCookie(link.id, expiresAt), (expiresAt - now) / 1000));
  for (const header of expireSessionHeaders(SESSION_COOKIE, sessionCookieDomain(requestHost(request.headers)))) res.headers.append("set-cookie", header);
  return res;
}

// A used link: Home for the browser that claimed it, cookies untouched; the ended page for anyone else.
// Null for an unused link. Checked before asking an owner anything, so a used link signs no one out.
async function used(link: ViewLinkRow, request: Request, now: number): Promise<NextResponse | null> {
  if (!isUsed(link)) return null;
  const mine = (await viewCookieClaims((await cookies()).get(VIEW_COOKIE)?.value, now))?.linkId === link.id;
  return viewerRedirect(mine ? "/" : LINK_ENDED_PATH, request);
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { token } = await params;
  const now = Date.now();
  const link = await liveLink(token, now);
  if (!link) return viewerRedirect(LINK_ENDED_PATH, request);
  const done = await used(link, request, now);
  if (done) return done;
  // Any signed session cookie here would be dropped: ask first. The signature only, over every copy the
  // browser sent (a stale duplicate can hide the valid one from cookies().get()): asking is harmless.
  for (const value of sessionCookieValues(request.headers.get("cookie"))) {
    if (await isValidSession(value)) return viewerRedirect(`/v/${token}/confirm`, request);
  }
  return becomeGuest(link, request, now);
}

// "Open as a guest" on the confirm page. A plain form POST from this very host only: a page elsewhere can't
// sign the owner out by posting here.
export async function POST(request: Request, { params }: Params) {
  await connection();
  const { token } = await params;
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403, headers: VIEWER_HEADERS });
  const now = Date.now();
  const link = await liveLink(token, now);
  if (!link) return viewerRedirect(LINK_ENDED_PATH, request);
  return (await used(link, request, now)) ?? becomeGuest(link, request, now);
}
