import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE, sessionClaims } from "@/lib/session";
import { VIEW_COOKIE, viewCookieLink } from "@/lib/view-cookie";
import type { ViewLink } from "@/lib/view-links";
import { asViewer, DEMO_OWNER, type Owner } from "./data/owner";
import { APPROVED, ownerOf } from "./data/system";
import { sessionUser } from "./tesla";
import { asViewLink, liveViewLink } from "./view-links";

export type { Owner } from "./data/owner";

// proxy.ts only checks the cookie's signature (no database). Server code that shows or changes data also
// checks the user it names is still approved and the session wasn't revoked by Sign out, "Sign out
// everywhere" or "Disconnect Tesla", and gets the account it is for: every per-user read and write takes that Owner.
export async function currentOwner(): Promise<Owner | null> {
  if (DEMO) return DEMO_OWNER;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(cookie))) return null;
  const claims = sessionClaims(cookie);
  if (!claims) return null;
  // A database error throws on purpose: the error page shows and the cookie survives, instead of
  // a hiccup signing everyone out.
  const user = await sessionUser(claims.userId);
  // A deleted account, or one no longer approved, has no valid session.
  if (user?.status !== APPROVED || user.signed_out_sessions.includes(claims.issuedAt)) return null;
  const validAfter = new Date(user.sessions_valid_after).getTime();
  // -infinity (never revoked) reads as 0.
  if (claims.issuedAt < (Number.isFinite(validAfter) ? validAfter : 0)) return null;
  // ownerOf never marks an owner view-only: only currentReader's viewer is.
  return ownerOf(user);
}

export async function hasCurrentSession(): Promise<boolean> {
  return (await currentOwner()) !== null;
}

// Where to send a revoked session: clears the cookie, then shows the login page.
export const SIGNED_OUT_PATH = "/api/auth/signed-out";

// ---- Readers: the owner, or someone the owner sent a view link ----

// Who reads a page: the signed-in owner (viewer null), or for a valid view link cookie the link's owner as
// a view-only Owner (asViewer) plus the link. Only pages and their read-only "Show more" actions use it:
// every action and every changing route keeps currentOwner(), which never accepts a viewer cookie.
export type Reader = { owner: Owner; viewer: ViewLink | null };

// The link and its owner, read fresh once per request (React cache), so ending a link, its end time, Sign
// out everywhere, Disconnect Tesla, Delete account and the owner leaving Uplink all apply on the next request.
const viewerOf = cache(async (linkId: number): Promise<Reader | null> => {
  const now = Date.now();
  const link = await liveViewLink(linkId, now);
  if (!link) return null;
  const user = await sessionUser(link.user_id);
  if (user?.status !== APPROVED) return null;
  // Sign out everywhere and Disconnect Tesla end every link made before them (they also mark each ended).
  const validAfter = new Date(user.sessions_valid_after).getTime();
  if (Date.parse(link.created_at) < (Number.isFinite(validAfter) ? validAfter : 0)) return null;
  // What the link leaves out rides on the Owner, so every loader it reaches can leave it out (hides()).
  const hidden = link.hide_locations ? (["locations"] as const) : [];
  return { owner: asViewer(Number(user.id), user.tesla_sub, hidden), viewer: asViewLink(link) };
});

export async function currentReader(): Promise<Reader | null> {
  const owner = await currentOwner();
  // The owner's own session wins: becoming a guest drops it (app/v/[token]/route.ts, after asking), so both
  // never ride together.
  if (owner) return { owner, viewer: null };
  if (DEMO) return null;
  const linkId = await viewCookieLink((await cookies()).get(VIEW_COOKIE)?.value);
  return linkId ? viewerOf(linkId) : null;
}

// Where a viewer goes when their link has ended: the ended page, which clears the viewer cookie.
export const LINK_ENDED_PATH = "/v/ended";

// The reader of a page, or a redirect: to the ended page for a viewer cookie whose link has ended, else to
// sign in again. redirect() throws, so a cached private scope never keeps a missing reader.
export async function requireReader(): Promise<Reader> {
  const reader = await currentReader();
  if (reader) return reader;
  redirect((await cookies()).get(VIEW_COOKIE) ? LINK_ENDED_PATH : SIGNED_OUT_PATH);
}

// For owner-only pages (Settings, setup, admin, feedback): true when the request is a live guest's (its
// link still open), so the page answers not found.
export async function isViewerRequest(): Promise<boolean> {
  if (DEMO) return false;
  return Boolean((await currentReader())?.viewer);
}

// Where an owner-only page (Settings, setup, admin) sends a request with no owner session: a live guest gets
// not found, a guest whose link has ended the ended page (which drops the cookie), anyone else signs in again.
export async function ownerOnlyExit(): Promise<never> {
  if (await isViewerRequest()) notFound();
  redirect(!DEMO && (await cookies()).get(VIEW_COOKIE) ? LINK_ENDED_PATH : SIGNED_OUT_PATH);
}
