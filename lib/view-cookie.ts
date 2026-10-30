// The viewer's cookie for a view link (lib/server/view-links.ts). Shared by proxy.ts, route handlers and
// pages, so it sticks to Web Crypto like lib/session.ts. It is signed with its own key and context, so a
// session cookie never passes as a viewer's, nor the other way round.
import { requestHost, safeEqual } from "@/lib/session";

export const VIEW_COOKIE = "tiu_view";

const encoder = new TextEncoder();

// Each cookie signs under its own context, so one never passes as the other.
type Context = "uplink/view/v1" | "uplink/view-pending/v1";

async function sign(payload: string, context: Context = "uplink/view/v1"): Promise<string> {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing env var TOKEN_ENCRYPTION_KEY");
  const key = await crypto.subtle.importKey("raw", encoder.encode(`view:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${context}:${payload}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function signed(linkId: number, expiresAtMs: number, context: Context): Promise<string> {
  const payload = `${linkId}.${Math.floor(expiresAtMs / 1000)}`;
  return `${payload}.${await sign(payload, context)}`;
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

async function claimsOf(cookie: string | undefined, now: number, context: Context): Promise<{ linkId: number; expiresAt: number } | null> {
  const parts = cookie?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [id, expires, sig] = parts;
  if (!POSITIVE_INTEGER.test(id) || !POSITIVE_INTEGER.test(expires) || !sig || Number(expires) * 1000 <= now) return null;
  try {
    return safeEqual(sig, await sign(`${id}.${expires}`, context)) ? { linkId: Number(id), expiresAt: Number(expires) * 1000 } : null;
  } catch {
    return null;
  }
}

// "<link id>.<expires unix>.<hmac>": which link, and when the cookie stops working (the link's own end).
// Only ever set by /v/seen to the one browser whose claim of the link won (a link opens in one browser).
export function createViewCookie(linkId: number, expiresAtMs: number): Promise<string> {
  return signed(linkId, expiresAtMs, "uplink/view/v1");
}

// The link a viewer cookie names and its end (ms), when it is well formed, signed by Uplink and not past
// its end; null otherwise. The signature only: the server re-reads the link to see it hasn't been ended.
export function viewCookieClaims(cookie: string | undefined, now = Date.now()): Promise<{ linkId: number; expiresAt: number } | null> {
  return claimsOf(cookie, now, "uplink/view/v1");
}

export async function viewCookieLink(cookie: string | undefined, now = Date.now()): Promise<number | null> {
  return (await viewCookieClaims(cookie, now))?.linkId ?? null;
}

const SECURE = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

// Set-Cookie values, written whole: the cookies API keeps one entry per name, and opening a link sets one
// cookie and expires two others in the same response. Host-only (no Domain): the viewer cookie never
// reaches the home page host or another subdomain.
export function viewCookieHeader(value: string, maxAgeSeconds: number): string {
  return `${VIEW_COOKIE}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; SameSite=Lax${SECURE()}`;
}

export function expireViewCookieHeader(): string {
  return `${VIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${SECURE()}`;
}

// ---- The guest hint: whether this browser is a guest's, readable by the page's first script ----
// Not a secret and never trusted by the server: only the root layout's GUEST_SCRIPT reads it, before the
// first paint, to make room for the guest pill (components/viewer-bar.tsx), so a guest's page doesn't move
// when the pill streams in. Its value is the link's end in unix seconds, so the script can tell the pill's
// last minutes too. proxy.ts sets it on every guest page and drops it on any other request that carries it.
export const GUEST_HINT_COOKIE = "tiu_guest";

export function guestHintHeader(expiresAtMs: number, maxAgeSeconds: number): string {
  return `${GUEST_HINT_COOKIE}=${Math.floor(expiresAtMs / 1000)}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; SameSite=Lax${SECURE()}`;
}

export function expireGuestHintHeader(): string {
  return `${GUEST_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${SECURE()}`;
}

// ---- Pending: set by /v/<token>, spent by the one browser that claims the link ----
// The link's id and end, signed under its own context, sent to /v/seen only. /v/open's script posts it
// there; a link preview fetches /v/<token> but never runs a script, so it never uses the link up. Signed, so
// no one can claim an unused link by writing its id into a cookie.
export const VIEW_PENDING_COOKIE = "tiu_view_new";
const PENDING_PATH = "/v/seen";

export function createPendingCookie(linkId: number, expiresAtMs: number): Promise<string> {
  return signed(linkId, expiresAtMs, "uplink/view-pending/v1");
}

export function pendingCookieClaims(cookie: string | undefined, now = Date.now()): Promise<{ linkId: number; expiresAt: number } | null> {
  return claimsOf(cookie, now, "uplink/view-pending/v1");
}

export function pendingHeader(value: string, maxAgeSeconds: number): string {
  return `${VIEW_PENDING_COOKIE}=${value}; Path=${PENDING_PATH}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; SameSite=Lax${SECURE()}`;
}

export function expirePendingHeader(): string {
  return `${VIEW_PENDING_COOKIE}=; Path=${PENDING_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${SECURE()}`;
}

// Expires the owner's session cookie: the host-only one, and the shared one when the host has a shared domain.
export function expireSessionHeaders(cookieName: string, domain: string | undefined): string[] {
  const base = `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${SECURE()}`;
  return domain ? [base, `${cookieName}=; Path=/; Domain=${domain}; Max-Age=0; HttpOnly; SameSite=Lax${SECURE()}`] : [base];
}

// What every viewer response carries: kept nowhere, never indexed, and the link never sent on in a Referer.
export const VIEWER_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
};

// Whether a POST came from a page on this very host: the Origin a browser sends with every form POST and
// fetch must name it. A missing or "null" Origin fails.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).host === (requestHost(request.headers) ?? new URL(request.url).host);
  } catch {
    return false;
  }
}
