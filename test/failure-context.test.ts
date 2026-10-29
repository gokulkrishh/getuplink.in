import { describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// Admin's failed checks: whether each account has had a good check since its failure. Made-up accounts.

let fake = new FakeDb();
mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
const { failureContext } = await import("@/lib/server/data/system");

const T = (h: number) => new Date(Date.parse("2026-10-29T00:00:00Z") + h * 3_600_000).toISOString();

describe("failureContext", () => {
  test("one account's many good checks never hide another account's good check", async () => {
    // Account 2 checks often: 1000 good checks after account 1's failure. Account 1 has one, at hour 5.
    const busy = Array.from({ length: 1000 }, (_, i) => ({ user_id: 2, ok: true, started_at: new Date(Date.parse(T(6)) + i * 60_000).toISOString() }));
    fake = new FakeDb({ poll_runs: [...busy, { user_id: 1, ok: true, started_at: T(5) }, { user_id: 1, ok: false, started_at: T(1) }], user_tokens: [] });
    const context = await failureContext([{ userId: 1, at: T(1) }, { userId: 2, at: T(2) }]);
    expect(context.get(1)?.lastGoodAt).toBe(T(5));
    expect(context.get(2)?.lastGoodAt).not.toBeNull();
  });

  test("only a good check after the account's failure counts; with several failures, after the earliest", async () => {
    fake = new FakeDb({
      poll_runs: [
        { user_id: 1, ok: true, started_at: T(0) },
        { user_id: 1, ok: true, started_at: T(4) },
        { user_id: 3, ok: true, started_at: T(0) },
      ],
      user_tokens: [{ user_id: 3, updated_at: T(7), access_token_enc: "enc" }],
    });
    const context = await failureContext([{ userId: 1, at: T(3) }, { userId: 1, at: T(2) }, { userId: 3, at: T(1) }]);
    expect(context.get(1)).toEqual({ lastGoodAt: T(4), tokensSavedAt: null });
    expect(context.get(3)).toEqual({ lastGoodAt: null, tokensSavedAt: T(7) });
    // One small query per account, never one shared list.
    expect(fake.calls.filter((c) => c.table === "poll_runs")).toHaveLength(2);
  });
});
