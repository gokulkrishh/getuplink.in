import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// The 6-hourly check against a database that answers every query with nothing, and a Tesla account with
// one car, to pin down the order of its steps. Only the streamed-version sync is replaced, to log when it ran.
let events: string[];
let carState: string;
let fleetPaths: string[];

const USER = { id: 1, tesla_sub: "owner", status: "approved" };
const TOKENS = {
  user_id: 1,
  access_token_enc: "enc:token",
  refresh_token_enc: "enc:refresh",
  expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  scope: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// A supabase-js query builder: any chain of filters, then the rows each read needs.
function query(table: string) {
  let op = "select";
  let onlyDisconnected = false; // .is("access_token_enc", null): the user has none
  const builder: Record<string, unknown> = {};
  const settle = (single: boolean) => {
    events.push(`${op} ${table}`);
    if (table === "poll_runs" && op === "insert") return { data: { id: 1 }, error: null };
    if (table === "users") return { data: single ? USER : [USER], error: null };
    if (table === "user_tokens" && !onlyDisconnected) return { data: single ? TOKENS : [TOKENS], error: null };
    return { data: single ? null : [], error: null, count: 0 };
  };
  const chain = new Proxy(builder, {
    get(_, key: string) {
      if (key === "then") return (resolve: (v: unknown) => void) => resolve(settle(false));
      if (key === "single" || key === "maybeSingle") return async () => settle(true);
      return (...args: unknown[]) => {
        if (key === "is" && args[1] === null) onlyDisconnected = true;
        if (["insert", "upsert", "update", "delete"].includes(key) && op === "select") op = key;
        return chain;
      };
    },
  });
  return chain;
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => ({ from: (table: string) => query(table), rpc: () => query("rpc") }) }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("@/lib/server/connector-token", () => ({ revokeConnectorToken: async () => {} }));
mock.module("@/lib/server/receipts", () => ({ deleteAllInvoices: async () => {} }));
mock.module("@/lib/server/stream-versions", () => ({
  syncStreamVersions: async () => {},
  syncStreamVersionsForAllCars: async () => {},
  syncStreamVersionsSafely: async () => {
    events.push("sync streamed versions");
  },
}));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const path = new URL(String(input)).pathname;
  fleetPaths.push(path);
  if (path === "/api/1/vehicles") return Response.json({ response: [{ id: 1, id_s: "1", vin: "VIN1", display_name: null, state: carState }] });
  return Response.json({ response: null });
}) as typeof fetch;

const { pollAll } = await import("@/lib/server/poll");

beforeEach(() => {
  events = [];
  fleetPaths = [];
  carState = "asleep";
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("the 6-hourly check", () => {
  test("syncs the versions the car streamed before it reads the car", async () => {
    // Recorded first by the check, a streamed install would carry the check's time and odometer instead.
    await pollAll();
    const firstSync = events.indexOf("sync streamed versions");
    const firstCarRead = events.findIndex((e) => e.endsWith(" vehicles"));
    expect(firstSync).toBeGreaterThanOrEqual(0);
    expect(firstCarRead).toBeGreaterThan(firstSync);
    // And again after, for a car seen for the first time.
    expect(events.lastIndexOf("sync streamed versions")).toBeGreaterThan(firstCarRead);
  });

  test("never asks an asleep car for its data", async () => {
    await pollAll();
    expect(fleetPaths.some((p) => p.includes("vehicle_data") || p.includes("wake_up"))).toBe(false);
    expect(events).toContain("insert snapshots");
  });
});
