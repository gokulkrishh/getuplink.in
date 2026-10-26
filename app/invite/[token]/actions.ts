"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
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
  (await cookies()).set(INVITE_COOKIE, inviteCookieValue(tokenHash(token), now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: INVITE_COOKIE_PATH,
    maxAge: INVITE_COOKIE_MAX_AGE,
  });
  redirect("/api/auth/connect");
}
