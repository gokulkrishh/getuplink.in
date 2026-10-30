import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { currentReader } from "@/lib/server/auth";
import { claimViewLink, liveViewLink, ViewLinksUnavailable } from "@/lib/server/view-links";
import { createViewCookie, expirePendingHeader, guestHintHeader, pendingCookieClaims, sameOrigin, VIEW_COOKIE, VIEW_PENDING_COOKIE, viewCookieClaims, VIEWER_HEADERS, viewCookieHeader } from "@/lib/view-cookie";

// Claims a view link for this browser: a link opens in one browser only. /v/open's script posts here, so a
// link preview (which fetches /v/<token> but runs no script) never uses a link up. Only with the signed
// pending cookie /v/<token> set, which this spends. The claim is one conditional update (claimViewLink): of
// two browsers racing, exactly one wins. The winner, and only the winner, gets the viewer cookie and its
// hint until the link's end. Answers { opened } for /v/open: true goes Home, false the ended page.
// A browser already holding a live viewer cookie (a second post, a reload of /v/open, or a second tab whose
// claim lost to the first) answers true. A database hiccup answers 503, so /v/open offers to try again
// rather than sending a guest to the ended page. Public in proxy.ts, like the other /v paths.
const unavailable = (err: unknown) => {
  console.warn("Claiming a view link failed:", (err as Error).message);
  return new NextResponse(null, { status: 503, headers: VIEWER_HEADERS });
};

export async function POST(request: Request) {
  await connection();
  const json = (opened: boolean) => NextResponse.json({ opened }, { headers: VIEWER_HEADERS });
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403, headers: VIEWER_HEADERS });
  const now = Date.now();
  const jar = await cookies();
  const pending = await pendingCookieClaims(jar.get(VIEW_PENDING_COOKIE)?.value, now);
  if (!pending) {
    try {
      return json(Boolean((await currentReader())?.viewer));
    } catch (err) {
      return unavailable(err);
    }
  }
  let link = null;
  let holds = false;
  try {
    link = await claimViewLink(pending.linkId, now);
    // Lost: still opened when this browser already holds the link (another tab of it won the claim).
    if (!link && (await viewCookieClaims(jar.get(VIEW_COOKIE)?.value, now))?.linkId === pending.linkId) {
      holds = Boolean(await liveViewLink(pending.linkId, now));
    }
  } catch (err) {
    // A database hiccup: keep the pending cookie, so trying again can still claim the link.
    if (!(err instanceof ViewLinksUnavailable)) return unavailable(err);
  }
  const res = json(Boolean(link) || holds);
  res.headers.append("set-cookie", expirePendingHeader());
  if (link) {
    const expiresAt = Date.parse(link.expires_at);
    const maxAge = (expiresAt - now) / 1000;
    res.headers.append("set-cookie", viewCookieHeader(await createViewCookie(link.id, expiresAt), maxAge));
    res.headers.append("set-cookie", guestHintHeader(expiresAt, maxAge));
  }
  return res;
}
