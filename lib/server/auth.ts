import "server-only";
import { cookies } from "next/headers";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE, sessionIssuedAt } from "@/lib/session";
import { asOwner, DEMO_OWNER, type Owner } from "./data/owner";
import { accountRow } from "./tesla";

export type { Owner } from "./data/owner";

// proxy.ts only checks the cookie's signature (no database). Server code that shows or changes data also
// checks it wasn't revoked by "Sign out everywhere" or "Disconnect Tesla", and gets the account it is for:
// every per-user read and write takes that Owner. The cookie names no account yet, so a current session is
// the one account's (step 3 puts the user in the cookie).
export async function currentOwner(): Promise<Owner | null> {
  if (DEMO) return DEMO_OWNER;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(cookie))) return null;
  const issuedAt = sessionIssuedAt(cookie) ?? 0;
  // A database error throws on purpose: the error page shows and the cookie survives, instead of
  // a hiccup signing everyone out.
  const account = await accountRow();
  // With no account row (fresh install or deleted account) no existing session is valid.
  if (!account?.owner_sub) return null;
  const validAfter = new Date(account.sessions_valid_after).getTime();
  // -infinity (never revoked) reads as 0.
  return issuedAt >= (Number.isFinite(validAfter) ? validAfter : 0) ? asOwner(account.owner_sub) : null;
}

export async function hasCurrentSession(): Promise<boolean> {
  return (await currentOwner()) !== null;
}

// Where to send a revoked session: clears the cookie, then shows the login page.
export const SIGNED_OUT_PATH = "/api/auth/signed-out";
