// Shared by proxy.ts, route handlers and server actions, so it sticks to Web Crypto.
export const SESSION_COOKIE = "tiu_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const STATE_COOKIE = "tiu_oauth_state";

const encoder = new TextEncoder();

// Sessions are signed with a key derived from TOKEN_ENCRYPTION_KEY, so rotating
// that key signs everyone out (and makes stored Tesla tokens unreadable).
async function sign(expiresAt: string): Promise<string> {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing env var TOKEN_ENCRYPTION_KEY");
  const key = await crypto.subtle.importKey("raw", encoder.encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`tesla-in-updates/session/v2:${expiresAt}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Cookie value: "<expires-at-unix>.<hmac>".
export async function createSession(): Promise<string> {
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE);
  return `${expiresAt}.${await sign(expiresAt)}`;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const [expiresAt, sig] = cookie?.split(".") ?? [];
  if (!expiresAt || !sig || Number(expiresAt) * 1000 < Date.now()) return false;
  try {
    return safeEqual(sig, await sign(expiresAt));
  } catch {
    return false;
  }
}
