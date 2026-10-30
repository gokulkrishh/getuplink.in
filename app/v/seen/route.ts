import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { currentReader } from "@/lib/server/auth";
import { claimViewLink, ViewLinksUnavailable } from "@/lib/server/view-links";
import { createViewCookie, expirePendingHeader, guestHintHeader, pendingCookieClaims, sameOrigin, VIEW_PENDING_COOKIE, VIEWER_HEADERS, viewCookieHeader } from "@/lib/view-cookie";

// Claims a view link for this browser: a link opens in one browser only. /v/open's script posts here, so a
// link preview (which fetches /v/<token> but runs no script) never uses a link up. Only with the signed
// pending cookie /v/<token> set, which this spends. The claim is one conditional update (claimViewLink): of
// two browsers racing, exactly one wins. The winner, and only the winner, gets the viewer cookie and its
// hint until the link's end. Answers { opened } for /v/open: true goes Home, false the ended page.
// A browser already holding a live viewer cookie (a second post, a reload of /v/open) answers true.
// Public in proxy.ts, like the other /v paths.
export async function POST(request: Request) {
  await connection();
  const json = (opened: boolean) => NextResponse.json({ opened }, { headers: VIEWER_HEADERS });
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403, headers: VIEWER_HEADERS });
  const now = Date.now();
  const pending = await pendingCookieClaims((await cookies()).get(VIEW_PENDING_COOKIE)?.value, now);
  if (!pending) {
    try {
      return json(Boolean((await currentReader())?.viewer));
    } catch {
      return json(false);
    }
  }
  let link = null;
  try {
    link = await claimViewLink(pending.linkId, now);
  } catch (err) {
    if (!(err instanceof ViewLinksUnavailable)) {
      // A database hiccup: keep the pending cookie, so trying again can still claim the link.
      console.warn("Claiming a view link failed:", (err as Error).message);
      return new NextResponse(null, { status: 503, headers: VIEWER_HEADERS });
    }
  }
  const res = json(Boolean(link));
  res.headers.append("set-cookie", expirePendingHeader());
  if (link) {
    const expiresAt = Date.parse(link.expires_at);
    const maxAge = (expiresAt - now) / 1000;
    res.headers.append("set-cookie", viewCookieHeader(await createViewCookie(link.id, expiresAt), maxAge));
    res.headers.append("set-cookie", guestHintHeader(expiresAt, maxAge));
  }
  return res;
}
