import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { FakeDb } from "./fake-db";

// The local sandbox (docs/sandbox.md) can't start in production or on Vercel, refuses to reach Tesla or
// Supabase while on, and outside it the fake Tesla is never used. The flow itself: sandbox-flow.test.ts.

let fake: FakeDb;
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

const ROOT = join(import.meta.dir, "..");
const { assertSandboxAllowed, envValue, guardFetch, isRealService, sandboxOn } = await import("@/lib/sandbox/flag");
const { sandboxTeslaCalls } = await import("@/lib/sandbox/tesla");
const { authorizeUrl, signIn } = await import("@/lib/server/tesla");
const { env } = await import("@/lib/server/env");

const saved = { ...process.env };
afterAll(() => {
  for (const key of ["UPLINK_SANDBOX", "SUPABASE_URL", "TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI", "SIGNUP_MODE"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the sandbox refuses to start outside local dev", () => {
  test("a production build or server, or anything on Vercel, throws", () => {
    expect(() => assertSandboxAllowed({ UPLINK_SANDBOX: "1", NODE_ENV: "production" })).toThrow(/production/);
    expect(() => assertSandboxAllowed({ UPLINK_SANDBOX: "1", NODE_ENV: "development", VERCEL: "1" })).toThrow(/Vercel/);
    expect(() => assertSandboxAllowed({ UPLINK_SANDBOX: "1", NODE_ENV: "production", VERCEL: "1" })).toThrow();
    // Local dev, and anywhere without the flag, start as usual.
    expect(() => assertSandboxAllowed({ UPLINK_SANDBOX: "1", NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSandboxAllowed({ NODE_ENV: "production", VERCEL: "1" })).not.toThrow();
  });

  test("next.config.ts throws when loaded for a production build with the flag", () => {
    const load = (env: Record<string, string>) =>
      Bun.spawnSync(["bun", "-e", 'await import("./next.config.ts")'], { cwd: ROOT, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
    const prod = load({ UPLINK_SANDBOX: "1", NODE_ENV: "production" });
    expect(prod.exitCode).not.toBe(0);
    expect(prod.stderr.toString()).toContain("UPLINK_SANDBOX");
    const vercel = load({ UPLINK_SANDBOX: "1", NODE_ENV: "development", VERCEL: "1" });
    expect(vercel.exitCode).not.toBe(0);
    expect(load({ UPLINK_SANDBOX: "1", NODE_ENV: "development" }).exitCode).toBe(0);
  });

  test("the flag alone doesn't turn it on: only next dev does", () => {
    process.env.UPLINK_SANDBOX = "1";
    // bun test runs as NODE_ENV=test; a production build inlines "production".
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(sandboxOn()).toBe(false);
  });
});

describe("while on, Tesla and Supabase are out of reach", () => {
  test("a fetch to Tesla or Supabase throws; anything else goes through", async () => {
    const seen: string[] = [];
    const guarded = guardFetch((async (input: string | URL | Request) => (seen.push(String(input)), new Response("ok"))) as typeof fetch);
    for (const url of [
      "https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles",
      "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token",
      "https://auth.tesla.com/oauth2/v3/authorize",
      "https://realprojectrefabcdef.supabase.co/rest/v1/users",
      "https://api.supabase.com/v1/projects",
    ]) {
      expect(isRealService(url)).toBe(true);
      await expect(guarded(url)).rejects.toThrow(/Sandbox: refused/);
    }
    expect(seen).toEqual([]);
    expect((await guarded("http://localhost:3000/api/health")).ok).toBe(true);
    expect(isRealService("https://nottesla.com.example/")).toBe(false);
  });
});

describe("outside the sandbox the fake Tesla is never used", () => {
  const calls: string[] = [];
  const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
  beforeEach(() => {
    calls.length = 0;
    sandboxTeslaCalls().length = 0;
    // The flag is set, as a stray .env.local might have it, but this isn't next dev.
    process.env.UPLINK_SANDBOX = "1";
    process.env.TESLA_CLIENT_ID = "client";
    process.env.TESLA_CLIENT_SECRET = "secret";
    process.env.TESLA_REDIRECT_URI = "https://app.example.test/api/auth/callback";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SIGNUP_MODE = "closed";
    fake = new FakeDb({ users: [] });
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return Response.json({ access_token: "a", refresh_token: "r", expires_in: 100, id_token: idToken("someone") });
    }) as unknown as typeof fetch;
  });

  test("sign-in goes to Tesla's real endpoints through fetch", async () => {
    // "owner" is a sandbox account's code: here it means nothing special.
    expect(await signIn("owner")).toBe("not-owner");
    expect(calls).toEqual(["https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token"]);
    expect(sandboxTeslaCalls()).toEqual([]);
  });

  test("the authorize URL is Tesla's, and the real settings are read", () => {
    expect(authorizeUrl("state")).toStartWith("https://auth.tesla.com/oauth2/v3/authorize?");
    expect(authorizeUrl("state")).not.toContain("sandbox");
    expect(env("SUPABASE_URL")).toBe("https://example.supabase.co");
    expect(envValue("TESLA_CLIENT_ID")).toBe("client");
  });
});
