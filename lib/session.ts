// Shared by proxy.ts, route handlers and server actions, so it sticks to Web Crypto.
export const SESSION_COOKIE = "tiu_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const STATE_COOKIE = "tiu_oauth_state";

const encoder = new TextEncoder();

// Sessions are signed with a key derived from TOKEN_ENCRYPTION_KEY, so rotating
// that key signs everyone out (and makes stored Tesla tokens unreadable).
async function sign(payload: string): Promise<string> {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing env var TOKEN_ENCRYPTION_KEY");
  const key = await crypto.subtle.importKey("raw", encoder.encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`tesla-in-updates/session/v3:${payload}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Cookie value: "<issued-at-ms>.<expires-at-unix>.<hmac>". The issue time lets "Sign out everywhere"
// revoke older sessions (checked on the server against oauth_tokens.sessions_valid_after).
export async function createSession(): Promise<string> {
  const payload = `${Date.now()}.${Math.floor(Date.now() / 1000) + SESSION_MAX_AGE}`;
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const [issuedAt, expiresAt, sig] = cookie?.split(".") ?? [];
  if (!issuedAt || !expiresAt || !sig || Number(expiresAt) * 1000 < Date.now()) return false;
  try {
    return safeEqual(sig, await sign(`${issuedAt}.${expiresAt}`));
  } catch {
    return false;
  }
}

// When the session was created (ms), or null for a malformed cookie.
export function sessionIssuedAt(cookie: string | undefined): number | null {
  const issuedAt = Number(cookie?.split(".")[0]);
  return Number.isFinite(issuedAt) ? issuedAt : null;
}
