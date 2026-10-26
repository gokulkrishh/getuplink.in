import { describe, expect, mock, test } from "bun:test";

process.env.TOKEN_ENCRYPTION_KEY = "test-key";
mock.module("server-only", () => ({}));

const { createSession, isValidSession, sessionClaims } = await import("@/lib/session");
const { signupMode } = await import("@/lib/server/env");

async function hmac(payload: string, context: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("session:test-key"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${context}:${payload}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("session cookie", () => {
  test("names its user, signed with it", async () => {
    const cookie = await createSession(7);
    expect(await isValidSession(cookie)).toBe(true);
    expect(sessionClaims(cookie)).toEqual({ userId: 7, issuedAt: expect.any(Number) });
  });

  test("another user's id can't be swapped in", async () => {
    const [, ...rest] = (await createSession(7)).split(".");
    expect(await isValidSession(["8", ...rest].join("."))).toBe(false);
  });

  test("a v3 cookie from before users is signed out", async () => {
    const payload = `${Date.now()}.${Math.floor(Date.now() / 1000) + 3600}`;
    expect(await isValidSession(`${payload}.${await hmac(payload, "tesla-in-updates/session/v3")}`)).toBe(false);
    // Nor does a v3 signature over a v4-shaped payload pass.
    const v4 = `7.${payload}`;
    expect(await isValidSession(`${v4}.${await hmac(v4, "tesla-in-updates/session/v3")}`)).toBe(false);
  });

  test("an expired cookie is refused", async () => {
    const payload = `7.${Date.now() - 10_000}.${Math.floor(Date.now() / 1000) - 1}`;
    expect(await isValidSession(`${payload}.${await hmac(payload, "uplink/session/v4")}`)).toBe(false);
  });
});

describe("SIGNUP_MODE", () => {
  test("is closed unless set to a known mode", () => {
    delete process.env.SIGNUP_MODE;
    expect(signupMode()).toBe("closed");
    process.env.SIGNUP_MODE = "everyone";
    expect(signupMode()).toBe("closed");
    process.env.SIGNUP_MODE = " Waitlist ";
    expect(signupMode()).toBe("waitlist");
    delete process.env.SIGNUP_MODE;
  });
});
