import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// Counting Fleet API requests, and the cron's per-user batching and budget guard, against a scripted
// database and a scripted Tesla. Made-up users and VINs.

type Row = Record<string, unknown>;
const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-26T09:00:00Z");

let users: Row[];
let usageRows: Row[];
let signalRows: Row[];
let lastRun: string | null;
let missing: Set<string>; // "api_usage", "schedule": what the migration would add
let rpcs: { fn: string; args: Row }[];
let claims: Row[]; // each claim RPC's name and arguments
let teslaAnswers: number[]; // statuses Tesla answers with, in order; then 200
let fleetCalls: { path: string; token: string }[];

const MISSING_TABLE = { code: "PGRST205", message: "Could not find the table" };
const MISSING_COLUMN = { code: "42703", message: "column users.next_check_at does not exist" };

const tokensFor = (id: number) => ({
  user_id: id,
  access_token_enc: `enc:token-${id}`,
  refresh_token_enc: `enc:refresh-${id}`,
  expires_at: new Date(Date.now() + 8 * HOUR).toISOString(),
  scope: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
});

// A supabase-js query builder: records the select columns and eq filters, then answers per table.
function query(table: string) {
  let op = "select";
  let columns = "";
  const eq: Record<string, unknown> = {};
  let nullTokens = false;
  const settle = (single: boolean) => {
    const many = (rows: Row[]) => ({ data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length });
    if (table === "users") {
      if (columns.includes("next_check_at") && missing.has("schedule")) return { data: null, error: MISSING_COLUMN };
      // A release (the claims are RPCs, below).
      if (op === "update") return missing.has("schedule") ? { data: null, error: MISSING_COLUMN } : many(users.filter((u) => u.id === eq.id));
      return many(users.filter((u) => u.status === "approved" && (eq.id === undefined || u.id === eq.id)));
    }
    if (table === "user_tokens") {
      const rows = users.map((u) => tokensFor(Number(u.id))).filter((t) => eq.user_id === undefined || t.user_id === eq.user_id);
      return many(nullTokens ? [] : rows);
    }
    if (table === "api_usage") return missing.has("api_usage") ? { data: null, error: MISSING_TABLE } : many(usageRows);
    if (table === "telemetry_signal_days") return missing.has("api_usage") ? { data: null, error: MISSING_TABLE } : many(signalRows);
    if (table === "poll_runs" && op === "insert") return { data: { id: 1 }, error: null };
    if (table === "poll_runs" && columns === "started_at") return { data: lastRun ? { started_at: lastRun } : null, error: null };
    return many([]);
  };
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === "then") return (resolve: (v: unknown) => void) => resolve(settle(false));
        if (key === "single" || key === "maybeSingle") return async () => settle(true);
        return (...args: unknown[]) => {
          if (key === "select" && op === "select") columns = String(args[0] ?? "");
          if (key === "eq") eq[String(args[0])] = args[1];
          if (key === "is" && args[1] === null) nullTokens = true;
          if (["insert", "upsert", "update", "delete"].includes(key) && op === "select") op = key;
          return chain;
        };
      },
    },
  );
  return chain;
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({
  db: () => ({
    from: (table: string) => query(table),
    rpc: async (fn: string, args: Row) => {
      const absent = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      if (fn === "increment_api_usage" && missing.has("api_usage")) return absent;
      // The claims' conditions are SQL (tested in PGlite); here every approved user listed can be claimed.
      if (fn === "claim_scheduled_check" || fn === "claim_check_now") {
        if (missing.has("schedule")) return absent;
        claims.push({ fn, ...args });
        return { data: users.some((u) => u.id === args.p_user_id), error: null };
      }
      rpcs.push({ fn, args });
      return { data: null, error: null };
    },
  }),
}));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("@/lib/server/connector-token", () => ({ revokeConnectorToken: async () => {} }));
mock.module("@/lib/server/receipts", () => ({ deleteAllInvoices: async () => {} }));
mock.module("@/lib/server/stream-versions", () => ({
  syncStreamVersions: async () => {},
  syncStreamVersionsForAllCars: async () => {},
  syncStreamVersionsSafely: async () => {},
}));
mock.module("@/lib/server/stream-charging", () => ({ syncStreamSessionsSafely: async () => {}, syncStreamSessionsForAllCars: async () => {} }));
mock.module("@/lib/server/charging", () => ({ syncChargingHistory: async () => {}, syncChargingHistoryThrottled: async () => {} }));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const token = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "").replace("Bearer ", "");
  fleetCalls.push({ path: url.pathname, token });
  const status = teslaAnswers.shift() ?? 200;
  if (status === 0) throw new TypeError("fetch failed");
  if (status !== 200) return new Response("nope", { status });
  if (url.pathname === "/api/1/vehicles") return Response.json({ response: [] });
  return Response.json({ response: { ok: true } });
}) as typeof fetch;

const { fleetGet } = await import("@/lib/server/tesla");
const { checkDue, checkNow, dueUsers, BATCH } = await import("@/lib/server/poll");
const { asOwner } = await import("@/lib/server/data/owner");
const { budgetState, loadUsage } = await import("@/lib/server/usage");

const approved = (id: number, schedule: Row = {}) => ({ id, tesla_sub: `sub-${id}`, status: "approved", ...schedule });
const counted = () => rpcs.filter((r) => r.fn === "increment_api_usage").map((r) => `${r.args.p_user_id}:${r.args.p_kind}`);

beforeEach(() => {
  users = [approved(1)];
  usageRows = [];
  signalRows = [];
  lastRun = null;
  missing = new Set();
  rpcs = [];
  claims = [];
  teslaAnswers = [];
  fleetCalls = [];
  delete process.env.TESLA_BUDGET_USD;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("counting requests", () => {
  const owner = asOwner(1, "sub-1");

  test("each answered request counts once, under its user and kind", async () => {
    await fleetGet(owner, "/api/1/vehicles/VIN0000000000001/vehicle_data?endpoints=charge_state");
    await fleetGet(owner, "/api/1/vehicles");
    expect(counted()).toEqual(["1:vehicle_data", "1:vehicle_list"]);
  });

  test("a 401 and its retry are two billed requests", async () => {
    process.env.TESLA_CLIENT_ID ??= "test-client";
    teslaAnswers = [401];
    // The refresh goes to Tesla's token endpoint, which isn't the Fleet API: answer it, uncounted.
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/oauth2/")) return Response.json({ access_token: "fresh", refresh_token: "r2", expires_in: 28800 });
      return fetchBefore(input, init);
    }) as typeof fetch;
    try {
      await fleetGet(owner, "/api/1/vehicles");
    } finally {
      globalThis.fetch = fetchBefore;
    }
    expect(counted()).toEqual(["1:vehicle_list", "1:vehicle_list"]);
  });

  test("a 408 is billed, a 5xx and no answer aren't", async () => {
    teslaAnswers = [408];
    await expect(fleetGet(owner, "/api/1/vehicles/VIN0000000000001/vehicle_data")).rejects.toThrow("408");
    teslaAnswers = [503];
    await expect(fleetGet(owner, "/api/1/vehicles")).rejects.toThrow("503");
    teslaAnswers = [0];
    await expect(fleetGet(owner, "/api/1/vehicles")).rejects.toThrow("fetch failed");
    expect(counted()).toEqual(["1:vehicle_data"]);
  });

  test("without the api_usage table, calls still work and the failure is logged once", async () => {
    missing.add("api_usage");
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
    try {
      expect(await fleetGet(owner, "/api/1/vehicles")).toEqual([]);
      expect(await fleetGet(owner, "/api/1/vehicles")).toEqual([]);
    } finally {
      console.warn = warn;
    }
    // Once per instance: at most one here (another test file in this process may have logged it first).
    expect(warnings.filter((w) => w.includes("Counting Tesla API usage failed")).length).toBeLessThanOrEqual(1);
    expect(counted()).toEqual([]);
  });
});

describe("the budget", () => {
  test("adds every user's requests and the streamed signals", async () => {
    usageRows = [
      { user_id: 1, kind: "vehicle_data", count: 1500 }, // $3.00
      { user_id: 2, kind: "vehicle_list", count: 500 }, // $1.00
      { user_id: 0, kind: "region", count: 5 }, // $0.01
    ];
    signalRows = [{ vin: "VIN0000000000001", signals: 300_000 }]; // $2.00
    const state = await budgetState(NOW);
    expect(state.spentUsd).toBeCloseTo(6.01, 10);
    expect(state.level).toBe("normal");
    expect(state.known).toBe(true);
  });

  test("TESLA_BUDGET_USD moves the cut points", async () => {
    usageRows = [{ user_id: 1, kind: "vehicle_data", count: 2000 }]; // $4.00
    process.env.TESLA_BUDGET_USD = "5";
    expect((await budgetState(NOW)).level).toBe("slow");
    process.env.TESLA_BUDGET_USD = "4";
    expect((await budgetState(NOW)).level).toBe("stopped");
  });

  test("unreadable usage never throttles", async () => {
    missing.add("api_usage");
    expect(await budgetState(NOW)).toMatchObject({ level: "normal", known: false });
  });

  test("a user sees their own share, an admin the account's too", async () => {
    usageRows = [
      { user_id: 1, kind: "vehicle_data", count: 500 },
      { user_id: 2, kind: "vehicle_data", count: 1000 },
    ];
    const mine = await loadUsage(asOwner(1, "sub-1"), false, NOW);
    expect(mine.mine.costUsd).toBeCloseTo(1, 10);
    expect(mine.account).toBeNull();
    expect(mine.resetsAt).toBe("2026-11-01T00:00:00.000Z");
    const admin = await loadUsage(asOwner(1, "sub-1"), true, NOW);
    expect(admin.account?.costUsd).toBeCloseTo(3, 10);
  });
});

describe("the cron's batches", () => {
  const owner = (id: number) => asOwner(id, `sub-${id}`);
  const at = (ms: number) => new Date(NOW + ms).toISOString();

  test("takes the due users, soonest first, at most a batch", () => {
    const owners = [1, 2, 3, 4, 5, 6, 7].map(owner);
    const plan = [
      { id: 1, next_check_at: at(HOUR), check_lock_until: null }, // not due
      { id: 2, next_check_at: at(-HOUR), check_lock_until: null },
      { id: 3, next_check_at: null, check_lock_until: null }, // never checked: first
      { id: 4, next_check_at: at(-3 * HOUR), check_lock_until: null },
      { id: 5, next_check_at: at(-2 * HOUR), check_lock_until: at(60_000) }, // held by a check
      { id: 6, next_check_at: at(-30 * 60_000), check_lock_until: at(-60_000) }, // lock ran out
      // 7 has no row yet: due
    ];
    expect(dueUsers(owners, plan, NOW).map((o) => o.userId)).toEqual([3, 7, 4, 2]);
    expect(BATCH).toBe(4);
    expect(dueUsers(owners, plan, NOW, 10).map((o) => o.userId)).toEqual([3, 7, 4, 2, 6]);
  });

  test("a run checks only a batch of due users, each with their own token", async () => {
    users = [1, 2, 3, 4, 5, 6].map((id) => approved(id));
    const result = await checkDue(() => NOW);
    expect(result.users).toBe(4);
    expect(claims.map((c) => c.p_user_id)).toEqual([1, 2, 3, 4]);
    expect(fleetCalls.filter((c) => c.path === "/api/1/vehicles").map((c) => c.token)).toEqual(["token-1", "token-2", "token-3", "token-4"]);
  });

  test("users not due are left alone", async () => {
    users = [approved(1, { next_check_at: at(2 * HOUR) })];
    expect(await checkDue(() => NOW)).toMatchObject({ skipped: "not due" });
    expect(fleetCalls).toEqual([]);
  });

  test("past the budget nothing is checked", async () => {
    usageRows = [{ user_id: 1, kind: "vehicle_data", count: 5000 }]; // $10.00
    users = [1, 2].map((id) => approved(id));
    expect(await checkDue(() => NOW)).toMatchObject({ skipped: "budget" });
    expect(fleetCalls).toEqual([]);
  });

  test("a check makes the user due again in 6 hours, or 12 near the budget", async () => {
    expect((await checkDue(() => NOW)).users).toBe(1);
    expect(claims[0]).toMatchObject({ fn: "claim_scheduled_check", p_now: at(0), p_next_at: at(6 * HOUR), p_lock_until: at(2 * 60_000) });
    claims = [];
    usageRows = [{ user_id: 1, kind: "vehicle_data", count: 4200 }]; // $8.40 of $10
    expect((await checkDue(() => NOW)).users).toBe(1);
    expect(claims[0]).toMatchObject({ p_next_at: at(12 * HOUR) });
  });

  test("before the migration, a run checks only once the last check is 6 hours old", async () => {
    missing.add("schedule");
    missing.add("api_usage");
    lastRun = new Date(NOW - HOUR).toISOString();
    expect(await checkDue(() => NOW)).toMatchObject({ skipped: "not due" });
    expect(fleetCalls).toEqual([]);
    lastRun = new Date(NOW - 6 * HOUR - 1).toISOString();
    expect((await checkDue(() => NOW)).users).toBe(1);
    expect(fleetCalls.some((c) => c.path === "/api/1/vehicles")).toBe(true);
  });
});

describe("the check after a sign-in", () => {
  test("checks only that user", async () => {
    users = [1, 2, 3].map((id) => approved(id));
    const result = await checkNow(asOwner(2, "sub-2"), () => NOW);
    expect(result.users).toBe(1);
    expect(fleetCalls.map((c) => c.token)).toEqual(["token-2"]);
  });

  test("is limited to once per 5 minutes", async () => {
    await checkNow(asOwner(1, "sub-1"), () => NOW);
    // The claim keeps the user only if their last one started before 5 minutes ago (the SQL is in PGlite).
    expect(claims[0]).toMatchObject({ fn: "claim_check_now", p_now: new Date(NOW).toISOString(), p_since: new Date(NOW - 5 * 60_000).toISOString() });
    // Within the 5 minutes Postgres matches no row: the check is refused.
    users = [];
    fleetCalls = [];
    expect(await checkNow(asOwner(1, "sub-1"), () => NOW)).toMatchObject({ skipped: "too soon" });
    expect(fleetCalls).toEqual([]);
  });

  test("is skipped past the budget", async () => {
    usageRows = [{ user_id: 1, kind: "vehicle_data", count: 6000 }];
    expect(await checkNow(asOwner(1, "sub-1"), () => NOW)).toMatchObject({ skipped: "budget" });
    expect(fleetCalls).toEqual([]);
  });
});
