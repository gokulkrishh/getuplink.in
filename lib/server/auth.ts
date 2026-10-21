import "server-only";
import { cookies } from "next/headers";
import { DEMO } from "@/lib/demo";
import { isValidSession, SESSION_COOKIE, sessionIssuedAt } from "@/lib/session";
import { sessionsValidAfter } from "./tesla";

// proxy.ts only checks the cookie's signature (no database). Server code that shows or changes
// data also checks it wasn't revoked by "Sign out everywhere" or "Disconnect Tesla".
export async function hasCurrentSession(): Promise<boolean> {
  if (DEMO) return true;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(cookie))) return false;
  const issuedAt = sessionIssuedAt(cookie) ?? 0;
  try {
    return issuedAt >= (await sessionsValidAfter());
  } catch {
    return false;
  }
}

// Where to send a revoked session: clears the cookie, then shows the login page.
export const SIGNED_OUT_PATH = "/api/auth/signed-out";
