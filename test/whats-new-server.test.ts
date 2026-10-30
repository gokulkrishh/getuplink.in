import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// The release notes reads and writes (lib/server/whats-new.ts): closing the welcome card, the marker that only
// moves forward, and no card or bell line before the migration.

let fake: FakeDb;
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));

const { closeWelcome, markSeen, whatsNewOf } = await import("@/lib/server/data/whats-new");
const { homeCardCheck, whatsNewBell } = await import("@/lib/server/whats-new");
const { asOwner } = await import("@/lib/server/data/owner");

const owner = asOwner(1, "tesla-1");
const NOW = Date.parse("2026-11-20T10:00:00+05:30");
const user = (patch: Record<string, unknown> = {}) => ({ id: 1, tesla_sub: "tesla-1", status: "approved", approved_at: "2026-11-05T00:00:00+05:30", welcomed_at: null, whats_new_seen: null, ...patch });
const row = () => fake.rows("users")[0];

beforeEach(() => {
  fake = new FakeDb({ users: [user()] });
});

describe("closing the welcome card", () => {
  test("welcomes the owner and marks the newest entry seen, so older news never shows", async () => {
    await closeWelcome(owner, "2026-11-20-a", new Date(NOW).toISOString());
    expect(row().welcomed_at).toBe(new Date(NOW).toISOString());
    expect(row().whats_new_seen).toBe("2026-11-20-a");
  });
  test("without entries it only welcomes", async () => {
    await closeWelcome(owner, null, new Date(NOW).toISOString());
    expect(row().whats_new_seen).toBeNull();
    expect(row().welcomed_at).not.toBeNull();
  });
  test("closing again keeps the first time and never moves the marker back", async () => {
    fake = new FakeDb({ users: [user({ welcomed_at: "2026-11-06T00:00:00Z", whats_new_seen: "2026-11-25-z" })] });
    await closeWelcome(owner, "2026-11-20-a", new Date(NOW).toISOString());
    expect(row().welcomed_at).toBe("2026-11-06T00:00:00Z");
    expect(row().whats_new_seen).toBe("2026-11-25-z");
  });
});

describe("the seen marker", () => {
  test("moves forward only", async () => {
    await markSeen(owner, "2026-11-20-a");
    expect(row().whats_new_seen).toBe("2026-11-20-a");
    await markSeen(owner, "2026-11-10-old");
    expect(row().whats_new_seen).toBe("2026-11-20-a");
    await markSeen(owner, "2026-11-22-b");
    expect(row().whats_new_seen).toBe("2026-11-22-b");
  });
  test("reads back what was stored", async () => {
    await markSeen(owner, "2026-11-20-a");
    expect(await whatsNewOf(owner)).toEqual({ approvedAt: Date.parse("2026-11-05T00:00:00+05:30"), welcomedAt: null, seen: "2026-11-20-a" });
  });
});

describe("before the migration", () => {
  test("no card and no bell line, and the share card still goes through", async () => {
    fake.missing.add("users");
    const check = await homeCardCheck(owner, false);
    expect(check(false, NOW)).toBeNull();
    expect(check(true, NOW)).toEqual({ kind: "share" });
    expect(await whatsNewBell(owner, false)).toEqual([]);
  });
  test("a ready database with a new owner gives the welcome card", async () => {
    fake = new FakeDb({ users: [user({ approved_at: "2026-11-05T00:00:00+05:30" })] });
    expect((await homeCardCheck(owner, false))(true, NOW)).toEqual({ kind: "welcome" });
  });
});
