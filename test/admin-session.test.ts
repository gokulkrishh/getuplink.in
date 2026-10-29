import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// The admin check against a fake database, with the session cookie the request carries. Made-up
// accounts only: user 1 is the admin, 2 an approved owner.

let fake: FakeDb;
let cookie: string | undefined;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tiu_session" && cookie ? { value: cookie } : undefined) }),
  headers: async () => new Headers(),
}));

for (const name of ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
  process.env[name] ??= "test";
}
process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";

const { createSession } = await import("@/lib/session");
const { adminOwner } = await import("@/lib/server/admin");

const user = (id: number, role: string) => ({ id, tesla_sub: `made-up-${id}`, status: "approved", role, sessions_valid_after: "-infinity", created_at: "2026-10-01T00:00:00Z" });
const userReads = () => fake.calls.filter((c) => c.table === "users" && c.op === "select").length;

beforeEach(() => {
  fake = new FakeDb({ users: [user(1, "admin"), user(2, "user")] });
});

describe("adminOwner", () => {
  test("the admin's session is checked and its role read in one users read", async () => {
    cookie = await createSession(1);
    expect((await adminOwner())?.userId).toBe(1);
    expect(userReads()).toBe(1);
  });

  test("an owner without the role is not the admin", async () => {
    cookie = await createSession(2);
    expect(await adminOwner()).toBeNull();
    expect(userReads()).toBe(1);
  });

  test("no session, no admin", async () => {
    cookie = undefined;
    expect(await adminOwner()).toBeNull();
    expect(userReads()).toBe(0);
  });
});
