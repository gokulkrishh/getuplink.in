import "server-only";
import { cookies } from "next/headers";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE, sessionClaims } from "@/lib/session";
import { DEMO_OWNER, type Owner } from "./data/owner";
import { APPROVED, ownerOf } from "./data/system";
import { sessionUser } from "./tesla";

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
  return claims.issuedAt >= (Number.isFinite(validAfter) ? validAfter : 0) ? ownerOf(user) : null;
}

export async function hasCurrentSession(): Promise<boolean> {
  return (await currentOwner()) !== null;
}

// Where to send a revoked session: clears the cookie, then shows the login page.
export const SIGNED_OUT_PATH = "/api/auth/signed-out";
