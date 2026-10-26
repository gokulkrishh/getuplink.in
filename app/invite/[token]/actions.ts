"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { STATE_COOKIE } from "@/lib/session";
import { authorizeUrl } from "@/lib/server/tesla";
import {
  allowInviteLookup,
  clientAddress,
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  INVITE_COOKIE_PATH,
  inviteCookieValue,
  lookupInvite,
  tokenHash,
} from "@/lib/server/invites";

// "Sign in with Tesla" on an invite page. The token is bound in by the page, never read from the form. It
// checks the link again (the page may have sat open), then carries it through Tesla's sign-in as a signed,
// short-lived cookie that only the callback reads. An invite that no longer works goes back to its page,
// which says why.
export async function startInviteSignIn(token: string): Promise<void> {
  const now = Date.now();
  const back = `/invite/${encodeURIComponent(token)}`;
  if (!allowInviteLookup(clientAddress(await headers()), now)) redirect(back);
  if ((await lookupInvite(token, now)) !== "unused") redirect(back);
  // Demo mode has no Tesla to sign in with.
  if (DEMO) redirect("/");
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(INVITE_COOKIE, inviteCookieValue(tokenHash(token), now), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: INVITE_COOKIE_PATH,
    maxAge: INVITE_COOKIE_MAX_AGE,
  });
  // Straight to Tesla, as /api/auth/connect does: an external redirect from an action is a full navigation.
  const state = randomBytes(24).toString("base64url");
  jar.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", path: "/api/auth", maxAge: 600 });
  redirect(authorizeUrl(state));
}
