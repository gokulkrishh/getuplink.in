import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// The health check's Tesla answer (streaming config and errors), reused for an hour from a stored row that
// every server instance shares. Made-up VINs and users.

type Row = Record<string, unknown>;
const MIN = 60_000;
const NOW = Date.parse("2026-10-26T09:00:00Z");

let stored: Row | null;
let tableMissing: boolean;
let teslaPaths: string[];
let errorsFail: boolean;

function query(table: string) {
  let op = "select";
  let values: Row | null = null;
  const settle = (single: boolean) => {
    if (table === "tesla_answer_cache") {
      if (tableMissing) return { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
      if (op === "upsert") {
        stored = values;
        return { data: null, error: null };
      }
      return { data: single ? stored : stored ? [stored] : [], error: null };
    }
    if (table === "user_tokens") {
      const t = { user_id: 1, access_token_enc: "enc:token", refresh_token_enc: "enc:refresh", expires_at: new Date(Date.now() + 8 * 60 * MIN).toISOString(), scope: null, created_at: "", updated_at: "" };
      return { data: single ? t : [t], error: null };
    }
    return { data: single ? null : [], error: null };
  };
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === "then") return (resolve: (v: unknown) => void) => resolve(settle(false));
        if (key === "single" || key === "maybeSingle") return async () => settle(true);
        return (...args: unknown[]) => {
          if (key === "upsert") {
            op = "upsert";
            values = args[0] as Row;
          }
          return chain;
        };
      },
    },
  );
  return chain;
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => ({ from: (t: string) => query(t), rpc: async () => ({ data: null, error: null }) }) }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const path = new URL(String(input)).pathname;
  teslaPaths.push(path);
  if (path.endsWith("fleet_telemetry_errors") && errorsFail) return new Response("nope", { status: 500 });
  if (path.endsWith("fleet_telemetry_config")) return Response.json({ response: { synced: true, config: { exp: 1_900_000_000 } } });
  return Response.json({ response: { fleet_telemetry_errors: [] } });
}) as typeof fetch;

const { isFresh, overtaken, streamState, TESLA_ANSWER_MS } = await import("@/lib/server/tesla-stream-state");
const { asOwner } = await import("@/lib/server/data/owner");
const owner = asOwner(1, "sub-1");
const VIN = "VIN0000000000001";

beforeEach(() => {
  stored = null;
  tableMissing = false;
  teslaPaths = [];
  errorsFail = false;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("the health check's Tesla answer", () => {
  test("is reused for an hour, so the bot's 15-minute calls ask Tesla once", async () => {
    expect(TESLA_ANSWER_MS).toBe(60 * MIN);
    const first = await streamState(owner, VIN, NOW);
    expect(teslaPaths).toHaveLength(2);
    expect(first.config?.synced).toBe(true);
    expect(first.fetchedAt).toBe(new Date(NOW).toISOString());
    for (const later of [15, 30, 45, 59]) {
      const again = await streamState(owner, VIN, NOW + later * MIN);
      expect(again.fetchedAt).toBe(new Date(NOW).toISOString());
      expect(again.config?.synced).toBe(true);
    }
    expect(teslaPaths).toHaveLength(2);
    const hourLater = await streamState(owner, VIN, NOW + 60 * MIN);
    expect(teslaPaths).toHaveLength(4);
    expect(hourLater.fetchedAt).toBe(new Date(NOW + 60 * MIN).toISOString());
  });

  test("asks again for another car", async () => {
    await streamState(owner, VIN, NOW);
    await streamState(owner, "VIN0000000000002", NOW + MIN);
    expect(teslaPaths).toHaveLength(4);
  });

  test("doesn't keep an answer whose errors read failed", async () => {
    errorsFail = true;
    await streamState(owner, VIN, NOW);
    expect(stored).toBeNull();
    errorsFail = false;
    await streamState(owner, VIN, NOW + MIN);
    expect(teslaPaths).toHaveLength(4);
  });

  test("without the table, asks Tesla every time and still answers", async () => {
    tableMissing = true;
    const a = await streamState(owner, VIN, NOW);
    const b = await streamState(owner, VIN, NOW + MIN);
    expect(a.config?.synced).toBe(true);
    expect(b.fetchedAt).toBe(new Date(NOW + MIN).toISOString());
    expect(teslaPaths).toHaveLength(4);
  });

  // 29 Oct 2026: the key was added back and /setup heard so at 02:21, but the 02:30 check reused Tesla's
  // 02:00 "no key, no config" answer. A stored answer /setup has since contradicted is asked again.
  test("is asked again when /setup has heard differently since", async () => {
    await streamState(owner, VIN, NOW);
    const since = new Date(NOW + 21 * MIN).toISOString();
    const car = { keyPaired: true, keyCheckedAt: since, streaming: "synced" as const, streamingCheckedAt: since };
    // Agrees with the stored answer (key on, config synced): reused.
    await streamState(owner, VIN, NOW + 30 * MIN, car);
    expect(teslaPaths).toHaveLength(2);
    // Disagrees: asked again.
    await streamState(owner, VIN, NOW + 30 * MIN, { ...car, streaming: "none" });
    expect(teslaPaths).toHaveLength(4);
  });

  test("overtaken: only an answer from after the stored one, that says something else", () => {
    const stored = { fetched_at: new Date(NOW).toISOString(), body: { config: { key_paired: false, config: null } } };
    const later = new Date(NOW + 21 * MIN).toISOString();
    const earlier = new Date(NOW - MIN).toISOString();
    expect(overtaken(stored, { keyPaired: true, keyCheckedAt: later, streaming: null, streamingCheckedAt: null })).toBe(true);
    expect(overtaken(stored, { keyPaired: true, keyCheckedAt: earlier, streaming: null, streamingCheckedAt: null })).toBe(false);
    expect(overtaken(stored, { keyPaired: false, keyCheckedAt: later, streaming: "none", streamingCheckedAt: later })).toBe(false);
    expect(overtaken(stored, { keyPaired: null, keyCheckedAt: later, streaming: "pending", streamingCheckedAt: later })).toBe(true);
    expect(overtaken(stored, null)).toBe(false);
  });

  test("freshness: same car, under an hour old, not from the future", () => {
    const at = (ms: number) => new Date(NOW + ms).toISOString();
    expect(isFresh(null, VIN, NOW)).toBe(false);
    expect(isFresh({ vin: VIN, fetched_at: at(-59 * MIN) }, VIN, NOW)).toBe(true);
    expect(isFresh({ vin: VIN, fetched_at: at(-60 * MIN) }, VIN, NOW)).toBe(false);
    expect(isFresh({ vin: "OTHER", fetched_at: at(0) }, VIN, NOW)).toBe(false);
    expect(isFresh({ vin: VIN, fetched_at: at(5 * MIN) }, VIN, NOW)).toBe(false);
  });
});
