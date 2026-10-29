import { describe, expect, test } from "bun:test";
import { type PostResult, sendIsolating } from "@/fly/telemetry/split";

// The telemetry receiver's write to Supabase when PostgREST refuses a batch: only the rows it refuses are
// dropped, the rest are written, and what failed for a moment is kept for the next try.

type Row = { id: number; bad?: boolean };
const rows = (n: number, bad: number[] = []): Row[] => Array.from({ length: n }, (_, id) => ({ id, bad: bad.includes(id) }));

// PostgREST as it answers an insert: the whole request is refused when any row in it is bad.
function postgrest(answer: (batch: Row[]) => PostResult = (batch) => (batch.some((r) => r.bad) ? { kind: "refused", status: 400, detail: "code=22P02" } : { kind: "ok" })) {
  const posts: Row[][] = [];
  const post = async (batch: Row[]) => (posts.push(batch), answer(batch));
  return { posts, post };
}

describe("sendIsolating", () => {
  test("one bad row in 500 drops only that row, in a handful of requests", async () => {
    const { posts, post } = postgrest();
    const refused: Row[] = [];
    const result = await sendIsolating(rows(500, [137]), post, (r) => refused.push(...r));
    expect(result.written).toBe(499);
    expect(refused.map((r) => r.id)).toEqual([137]);
    expect(result.retry).toEqual([]);
    expect(posts.length).toBeLessThanOrEqual(19);
  });

  test("a refusal no single row causes (auth, missing table) drops the batch in one request, as before", async () => {
    const { posts, post } = postgrest(() => ({ kind: "refused", status: 401, detail: "" }));
    const refused: Row[] = [];
    const result = await sendIsolating(rows(500), post, (r) => refused.push(...r));
    expect(posts.length).toBe(1);
    expect(refused.length).toBe(500);
    expect(result.written).toBe(0);
  });

  test("every row bad: a bounded number of requests, then the rest dropped whole", async () => {
    const { posts, post } = postgrest((batch) => ({ kind: "refused", status: 400, detail: `${batch.length}` }));
    const refused: Row[] = [];
    await sendIsolating(rows(500), post, (r) => refused.push(...r));
    expect(refused.length).toBe(500);
    expect(posts.length).toBeLessThanOrEqual(41);
  });

  test("a moment's failure partway keeps the unsent rows for the next try, and never re-sends written ones", async () => {
    let failed = false;
    const { post } = postgrest((batch) => {
      if (batch.some((r) => r.bad)) return { kind: "refused", status: 400, detail: "" };
      // The first request after the split fails for a moment (Supabase 503).
      if (batch.length < 500 && !failed && batch[0].id >= 250) return (failed = true), { kind: "retry" };
      return { kind: "ok" };
    });
    const result = await sendIsolating(rows(500, [10]), post, () => {});
    expect(result.retry.map((r) => r.id)).toEqual(Array.from({ length: 250 }, (_, k) => 250 + k));
    expect(result.written).toBe(249);
  });
});
