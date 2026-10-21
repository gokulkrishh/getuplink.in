// Shared by proxy.ts and the login action, so it sticks to Web Crypto.
export const SESSION_COOKIE = "tiu_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

// The cookie value is an HMAC of a fixed label keyed by the passphrase:
// changing DASHBOARD_PASSPHRASE signs everyone out.
export async function sessionToken(passphrase: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(passphrase), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode("tesla-in-updates/session/v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const passphrase = process.env.DASHBOARD_PASSPHRASE;
  if (!passphrase || !cookie) return false;
  return safeEqual(cookie, await sessionToken(passphrase));
}

export const STATE_COOKIE = "tiu_oauth_state";
