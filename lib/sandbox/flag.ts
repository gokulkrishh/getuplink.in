// The local sandbox (`bun run sandbox`): the real sign-in, invite and Access code against a fake Tesla
// (lib/sandbox/tesla.ts) and a throwaway in-memory database (lib/sandbox/db.ts). See docs/sandbox.md.
//
// On only under `next dev` with UPLINK_SANDBOX=1. Read at call time, so a test can switch it; the literal
// NODE_ENV check lets a production build fold every sandbox branch to false. No server-only here: proxy.ts
// and lib/session.ts read it too.

export function sandboxOn(): boolean {
  return process.env.NODE_ENV === "development" && process.env.UPLINK_SANDBOX === "1";
}

// Refuses to start with the flag set anywhere but a local dev server: next.config.ts calls this (next dev,
// next build, next start, and every Vercel build), and instrumentation.ts again when a server starts.
export function assertSandboxAllowed(env: Record<string, string | undefined> = process.env): void {
  if (!env.UPLINK_SANDBOX) return;
  if (env.VERCEL) throw new Error("UPLINK_SANDBOX is set on Vercel. The sandbox is local only: remove it.");
  if (env.NODE_ENV === "production") throw new Error("UPLINK_SANDBOX is set in a production build or server. The sandbox is local only: remove it.");
}

// 32 bytes, base64: a fixed key, so sandbox sessions and stored fake tokens survive a restart, and never
// verify outside the sandbox (or inside it, the real ones).
const SANDBOX_KEY = "dXBsaW5rLWxvY2FsLXNhbmRib3gtbm90LXNlY3JldCE="; // "uplink-local-sandbox-not-secret!"

// What the sandbox reads instead of the real environment, for every setting read through envValue (env(),
// missingEnv(), signupMode(), session signing, Costs' Supabase token): the real Supabase URL and keys,
// Tesla's app secrets and the encryption key are never read. Undefined means unset.
export const SANDBOX_ENV: Readonly<Record<string, string | undefined>> = {
  TESLA_CLIENT_ID: "sandbox-client",
  TESLA_CLIENT_SECRET: "sandbox-secret",
  TESLA_REDIRECT_URI: "/api/auth/callback",
  TESLA_FLEET_API_BASE_URL: undefined,
  SUPABASE_URL: "http://supabase.sandbox.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "sandbox-not-a-key",
  SUPABASE_ACCESS_TOKEN: undefined,
  TOKEN_ENCRYPTION_KEY: SANDBOX_KEY,
  // missingEnv() asks for it; the cron routes themselves still check the real one.
  CRON_SECRET: "sandbox-cron",
  MAX_USERS: undefined,
  // Invite only, as Uplink ships; SANDBOX_SIGNUP_MODE tries another.
  SIGNUP_MODE: process.env.SANDBOX_SIGNUP_MODE || "invite",
};

// process.env[name], or the sandbox's value for it while the sandbox is on.
export function envValue(name: string): string | undefined {
  if (sandboxOn() && Object.hasOwn(SANDBOX_ENV, name)) return SANDBOX_ENV[name];
  return process.env[name];
}

// Hosts the sandbox must never reach. instrumentation.ts refuses any fetch to them while it is on.
const REAL_SERVICES = [/(^|\.)tesla\.com$/, /(^|\.)teslamotors\.com$/, /(^|\.)supabase\.co$/, /(^|\.)supabase\.com$/, /(^|\.)supabase\.in$/];

export function isRealService(url: string | URL): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return REAL_SERVICES.some((re) => re.test(host));
  } catch {
    return false;
  }
}

// Wraps fetch so a request to Tesla or Supabase throws instead of leaving the machine.
export function guardFetch(inner: typeof fetch): typeof fetch {
  const guarded = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input;
    if (isRealService(url)) throw new Error(`Sandbox: refused a request to ${new URL(url).hostname}`);
    return inner(input, init);
  }) as typeof fetch;
  return guarded;
}
