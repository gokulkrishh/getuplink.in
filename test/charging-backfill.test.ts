import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { standIn } from "./stand-in";
import type { Owner } from "@/lib/server/data/owner";

// Tesla's charging history for one car, served 50 a time, and the charging_sessions table, behind enough
// of fetch and supabase-js for syncChargingHistory (lib/server/tesla.ts's fleetGet runs as it is).
const DAY = 86_400_000;
const FULL_FROM = "2012-01-01T00:00:00.000Z";
type Item = { sessionId: number; chargeStartDateTime: string; fees: { feeType: string; uom: string; usageBase: number; totalDue: number; currencyCode: string }[] };
let history: Item[];
// The status a request gets instead of its page, or null for the page.
let fail: (query: URLSearchParams) => number | null;
let requests: URLSearchParams[];
let stored: Map<string, Record<string, unknown>>;
let upserts: number[];

const realFetch = globalThis.fetch;
// Set before each test, not once at load: other files swap fetch too, and bun runs them in one process.
const fakeFetch = (async (input: string | URL | Request) => {
  const query = new URL(String(input)).searchParams;
  requests.push(query);
  const status = fail(query);
  if (status !== null) return new Response("nope", { status });
  const pageNo = Number(query.get("pageNo"));
  const size = Number(query.get("pageSize"));
  const since = Date.parse(query.get("startTime")!);
  const items = history.filter((h) => Date.parse(h.chargeStartDateTime) >= since);
  return Response.json({ response: { data: items.slice((pageNo - 1) * size, pageNo * size) } });
}) as typeof fetch;

// charging_sessions, and a user_tokens row whose access token is good for hours.
type Row = Record<string, unknown>;
class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private sortBy: string | null = null;
  constructor(private table: string) {}
  async maybeSingle() {
    if (this.table !== "user_tokens") throw new Error(`Unexpected read of ${this.table}`);
    return { data: { access_token_enc: "enc:token", refresh_token_enc: "enc:refresh", expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString() }, error: null };
  }
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  order(column: string) {
    this.sortBy = column;
    return this;
  }
  limit(n: number) {
    const rows = [...stored.values()].filter((r) => this.filters.every((f) => f(r)));
    const by = this.sortBy;
    if (by) rows.sort((a, b) => Date.parse(a[by] as string) - Date.parse(b[by] as string));
    return Promise.resolve({ data: rows.slice(0, n), error: null });
  }
  upsert(rows: Row[]) {
    upserts.push(rows.length);
    for (const r of rows) stored.set(r.session_id as string, r);
    return Promise.resolve({ error: null });
  }
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => ({ from: (table: string) => new Query(table) }) }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
await standIn("@/lib/server/receipts", { deleteAllInvoices: async () => {} });
// The backfill pauses between pages; nothing here needs real time to pass.
const realSetTimeout = globalThis.setTimeout;

const { syncChargingHistory } = await import("@/lib/server/charging");

const VIN = "5YJ3E7EB0RF000001";
const OWNER = { userId: 1, sub: "owner" } as Owner;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const session = (id: number, daysAgo: number): Item => ({
  sessionId: id,
  chargeStartDateTime: ago(daysAgo),
  fees: [{ feeType: "CHARGING", uom: "kwh", usageBase: 30, totalDue: 600, currencyCode: "INR" }],
});
// Sessions every other day back to `days` ago, newest first.
const every2Days = (days: number) => Array.from({ length: Math.floor(days / 2) }, (_, k) => session(1000 + k, 1 + 2 * k));
const windowDays = (query: URLSearchParams) => Math.round((Date.now() - Date.parse(query.get("startTime")!)) / DAY);

beforeEach(() => {
  globalThis.fetch = fakeFetch;
  history = [];
  fail = () => null;
  requests = [];
  stored = new Map();
  upserts = [];
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
});

afterAll(() => {
  globalThis.setTimeout = realSetTimeout;
  globalThis.fetch = realFetch;
});

describe("Supercharger history backfill", () => {
  test("the first check reads everything Tesla keeps, and saves it in batches", async () => {
    history = every2Days(400); // 200 sessions, most older than 120 days
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests[0].get("startTime")).toBe(FULL_FROM);
    expect(requests.map((q) => q.get("pageNo"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(stored.size).toBe(200);
    expect(upserts.every((n) => n <= 50)).toBe(true);
  });

  test("once stored, later checks only top up the last 120 days", async () => {
    history = every2Days(400);
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    requests = [];
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests.map(windowDays)).toEqual([120, 120]); // 60 sessions in the window: a full page, then a short one
  });

  test("rows the 120-day top-ups already stored don't count as the full history", async () => {
    // The old code's first top-up, 4 days ago, reached back 124 days: a session from 122 days ago is now
    // outside the window, but was fetched only 118 days after it started.
    history = every2Days(400);
    stored.set("old", { session_id: "old", vehicle_vin: VIN, started_at: ago(122), fetched_at: ago(4) });
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests[0].get("startTime")).toBe(FULL_FROM);
    expect(stored.size).toBe(201);
  });

  test("re-running never duplicates a session", async () => {
    history = every2Days(400);
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    await syncChargingHistory(OWNER, [VIN]);
    expect(stored.size).toBe(200);
  });

  test("a session seen on two pages is written once", async () => {
    history = every2Days(140);
    history.splice(50, 0, history[49]); // Tesla's pages shift: the last of page 1 is first on page 2
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(stored.size).toBe(70);
    expect(upserts.reduce((a, n) => a + n, 0)).toBe(70);
  });

  test("a rate limit halfway saves nothing, and the next check starts over", async () => {
    history = every2Days(400);
    fail = (q) => (q.get("pageNo") === "3" ? 429 : null);
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(stored.size).toBe(0);
    expect(requests).toHaveLength(3); // no second request into the rate limit
    fail = () => null;
    requests = [];
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests[0].get("startTime")).toBe(FULL_FROM);
    expect(stored.size).toBe(200);
  });

  test("no charging scope (403) is skipped quietly", async () => {
    history = every2Days(400);
    fail = () => 403;
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(stored.size).toBe(0);
  });

  test("if Tesla refuses the full read, the check still tops up the last 120 days", async () => {
    history = every2Days(400);
    fail = (q) => (q.get("startTime") === FULL_FROM ? 400 : null);
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(stored.size).toBe(60);
    expect(windowDays(requests.at(-1)!)).toBe(120);
  });

  test("history longer than the page cap saves nothing from the full read, and tops up instead", async () => {
    history = Array.from({ length: 40 * 50 + 1 }, (_, k) => session(k, 1 + k / 10));
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests.filter((q) => q.get("startTime") === FULL_FROM)).toHaveLength(40);
    expect(requests.filter((q) => windowDays(q) === 120)).toHaveLength(10);
    expect(stored.size).toBe(500);
    expect([...stored.values()].every((r) => Date.parse(r.started_at as string) >= Date.now() - 120 * DAY)).toBe(true);
  });

  test("without backfill (the Stats page's sync) it reads the last 120 days only", async () => {
    history = every2Days(400);
    await syncChargingHistory(OWNER, [VIN]);
    expect(requests.map(windowDays)).toEqual([120, 120]);
    expect(stored.size).toBe(60);
  });

  test("a car with nothing older than 120 days keeps reading in full, at the top-up's cost", async () => {
    history = every2Days(60);
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    await syncChargingHistory(OWNER, [VIN], { backfill: true });
    expect(requests.map((q) => q.get("startTime"))).toEqual([FULL_FROM, FULL_FROM]);
    expect(stored.size).toBe(30);
  });
});
