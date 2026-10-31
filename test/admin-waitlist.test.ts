import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// The waitlist's server actions against a fake database, with the session cookie the request carries.
// Made-up accounts only: user 1 is the admin, 2 approved, 3 and 4 waiting, 5 suspended, 6 declined.

let fake: FakeDb;
let cookie: string | undefined;
const tagsUpdated: string[] = [];

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tiu_session" && cookie ? { value: cookie } : undefined) }),
  headers: async () => new Headers(),
}));
const realCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...realCache,
  updateTag: (tag: string) => tagsUpdated.push(tag),
  revalidatePath: () => {},
  cacheLife: () => {},
  cacheTag: () => {},
}));

for (const name of ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
  process.env[name] ??= "test";
}
process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";

const { createSession } = await import("@/lib/session");
const { decideAccount } = await import("@/app/admin/waitlist/actions");
const { loadWaitlist } = await import("@/lib/server/waitlist");

const user = (id: number, status: string, role = "user") => ({
  id,
  tesla_sub: `made-up-${id}`,
  status,
  role,
  sessions_valid_after: "-infinity",
  created_at: `2026-10-0${id}T00:00:00Z`,
  updated_at: `2026-10-0${id}T00:00:00Z`,
});

beforeEach(async () => {
  delete process.env.MAX_USERS;
  tagsUpdated.length = 0;
  fake = new FakeDb({
    users: [user(1, "approved", "admin"), user(2, "approved"), user(3, "waitlist"), user(4, "waitlist"), user(5, "suspended"), user(6, "declined")],
  });
  cookie = await createSession(1);
});

const status = (id: number) => fake.rows("users").find((r) => r.id === id)?.status;
const statuses = () => fake.rows("users").map((r) => r.status);

describe("who may decide", () => {
  test("no session is refused and nothing changes", async () => {
    cookie = undefined;
    const before = statuses();
    expect(await decideAccount("approve", 3, null)).toBe("Not allowed.");
    expect(statuses()).toEqual(before);
  });

  test("a forged cookie is refused", async () => {
    cookie = `1.${Date.now()}.${Math.floor(Date.now() / 1000) + 3600}.${"0".repeat(64)}`;
    expect(await decideAccount("approve", 3, null)).toBe("Not allowed.");
    expect(status(3)).toBe("waitlist");
  });

  test("an approved user who isn't the admin is refused", async () => {
    cookie = await createSession(2);
    expect(await decideAccount("approve", 3, null)).toBe("Not allowed.");
    expect(await decideAccount("suspend", 2, null)).toBe("Not allowed.");
    expect(status(3)).toBe("waitlist");
  });

  test("the role is read again on every action: an admin whose role is removed is refused", async () => {
    expect(await decideAccount("approve", 3, null)).toBeNull();
    fake.rows("users")[0].role = "user";
    expect(await decideAccount("approve", 4, null)).toBe("Not allowed.");
    expect(status(4)).toBe("waitlist");
  });

  test("an admin who is no longer approved is refused", async () => {
    fake.rows("users")[0].status = "suspended";
    expect(await decideAccount("approve", 3, null)).toBe("Not allowed.");
  });

  test("a revoked session is refused", async () => {
    fake.rows("users")[0].sessions_valid_after = new Date(Date.now() + 1000).toISOString();
    expect(await decideAccount("approve", 3, null)).toBe("Not allowed.");
  });

  test("bound values that aren't a decision or an account id are refused", async () => {
    expect(await decideAccount("delete" as never, 3, null)).toBe("Not allowed.");
    expect(await decideAccount("approve", -1, null)).toBe("Not allowed.");
    expect(await decideAccount("approve", 1.5, null)).toBe("Not allowed.");
  });
});

describe("decisions", () => {
  test("approve, decline, suspend, restore and reopen move one account each", async () => {
    expect(await decideAccount("approve", 3, null)).toBeNull();
    expect(status(3)).toBe("approved");
    expect(fake.rows("users").find((r) => r.id === 3)?.approved_at).toBeString();
    expect(await decideAccount("decline", 4, null)).toBeNull();
    expect(status(4)).toBe("declined");
    expect(await decideAccount("suspend", 2, null)).toBeNull();
    expect(status(2)).toBe("suspended");
    expect(await decideAccount("restore", 5, null)).toBeNull();
    expect(status(5)).toBe("approved");
    expect(await decideAccount("reopen", 6, null)).toBeNull();
    expect(status(6)).toBe("waitlist");
    expect(tagsUpdated).toContain("admin-waitlist");
  });

  test("a decision on an account in another state changes nothing", async () => {
    expect(await decideAccount("approve", 2, null)).toBe("Already decided. Reload to see it.");
    expect(await decideAccount("suspend", 3, null)).toBe("Already decided. Reload to see it.");
    expect(await decideAccount("approve", 99, null)).toBe("Already decided. Reload to see it.");
    expect(status(3)).toBe("waitlist");
  });

  test("the admin can't suspend themselves or another admin", async () => {
    fake.rows("users").push(user(7, "approved", "admin"));
    expect(await decideAccount("suspend", 1, null)).not.toBeNull();
    expect(await decideAccount("suspend", 7, null)).not.toBeNull();
    expect(status(1)).toBe("approved");
    expect(status(7)).toBe("approved");
  });
});

describe("the cap", () => {
  test("approving past MAX_USERS is refused, and so is restoring", async () => {
    process.env.MAX_USERS = "3";
    expect(await decideAccount("approve", 3, null)).toBeNull(); // 3 of 3
    expect(await decideAccount("approve", 4, null)).toBe("All 3 places are used.");
    expect(await decideAccount("restore", 5, null)).toBe("All 3 places are used.");
    expect(status(4)).toBe("waitlist");
    expect(status(5)).toBe("suspended");
    // Declining and suspending still work when full, and suspending frees a place.
    expect(await decideAccount("suspend", 2, null)).toBeNull();
    expect(await decideAccount("approve", 4, null)).toBeNull();
    expect(statuses().filter((s) => s === "approved")).toHaveLength(3);
  });

  test("two approvals at once for the last place: one is approved, the other is told it's full", async () => {
    process.env.MAX_USERS = "3"; // the admin and user 2 hold two places
    const results = await Promise.all([decideAccount("approve", 3, null), decideAccount("approve", 4, null)]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results).toContain("All 3 places are used.");
    expect(statuses().filter((s) => s === "approved")).toHaveLength(3);
  });

  test("before the approve_within_cap migration, approving past MAX_USERS is still refused", async () => {
    fake.missingRpcs.add("approve_within_cap");
    process.env.MAX_USERS = "3";
    expect(await decideAccount("approve", 3, null)).toBeNull();
    expect(await decideAccount("approve", 4, null)).toBe("All 3 places are used.");
    expect(statuses().filter((s) => s === "approved")).toHaveLength(3);
  });

  test("defaults to 25", async () => {
    for (let id = 10; id < 33; id++) fake.rows("users").push(user(id, "approved")); // 25 approved
    expect(await decideAccount("approve", 3, null)).toBe("All 25 places are used.");
  });

  test("the page counts places used, the admin included, and lists no admin and no Tesla id", async () => {
    const page = await loadWaitlist(Date.now());
    expect(page.used).toBe(2);
    expect(page.max).toBe(25);
    expect(page.pending.map((a) => a.id)).toEqual([3, 4]); // oldest first
    expect(page.approved.map((a) => a.id)).toEqual([2]);
    expect(JSON.stringify(page)).not.toContain("made-up-");
  });
});
