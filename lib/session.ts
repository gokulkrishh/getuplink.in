// Shared by proxy.ts, route handlers and server actions, so it sticks to Web Crypto.
export const SESSION_COOKIE = "tiu_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const STATE_COOKIE = "tiu_oauth_state";

// The host the browser used. Route handlers and actions can see the server's own host instead (the dev
// server reports localhost:3000 for app.uplink.localhost), so prefer the forwarded one.
export function requestHost(headers: { get(name: string): string | null }): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

// The session cookie is shared with the home page so it can show "Dashboard" to a signed-in owner; it
// stays HttpOnly. getuplink.in in production, uplink.localhost locally; host-only elsewhere (previews).
export const SHARED_DOMAINS = ["getuplink.in", "uplink.localhost"];
export function sessionCookieDomain(host: string | null | undefined): string | undefined {
  const name = host?.split(":")[0];
  return SHARED_DOMAINS.find((d) => name === d || name?.endsWith(`.${d}`));
}

// Every session cookie value the browser sent. A host-only cookie from before the shared one can ride
// along with it under the same name, and cookies.get() keeps whichever comes last, which in Safari can
// be the stale one: the home page then shows Dashboard while the app sends you back to sign in.
export function sessionCookieValues(cookieHeader: string | null): string[] {
  const prefix = `${SESSION_COOKIE}=`;
  return (cookieHeader ?? "")
    .split(/; */)
    .filter((pair) => pair.startsWith(prefix))
    .map((pair) => pair.slice(prefix.length));
}

// Expires only a host-only session cookie (no Domain attribute), leaving the shared one alone. Appended
// as a raw header because the cookies API keeps one entry per name.
export const EXPIRE_HOST_ONLY_SESSION = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
  process.env.NODE_ENV === "production" ? "; Secure" : ""
}`;

type CookieJar ={ delete(options: { name: string; path?: string; domain?: string }): unknown };

// Clears both the shared cookie and any older host-only one.
export function clearSession(jar: CookieJar, host: string | null | undefined) {
  jar.delete({ name: SESSION_COOKIE, path: "/" });
  const domain = sessionCookieDomain(host);
  if (domain) jar.delete({ name: SESSION_COOKIE, path: "/", domain });
}

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

// Compares every character of the expected value whatever the input's length, so timing reveals
// neither the secret nor its length.
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
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
