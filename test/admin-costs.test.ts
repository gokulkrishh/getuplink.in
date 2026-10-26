import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb } from "./fake-db";

// /admin/costs: who may save, what is saved, and the providers failing soft. Made-up accounts and tokens
// only: user 1 is the admin, user 2 an approved owner.

let fake: FakeDb;
let missing = false; // the costs migration not applied: every costs query fails with 42P01
let cookie: string | undefined;
const tagsUpdated: string[] = [];

const missingTable = () => {
  const result = { data: null, error: { code: "42P01", message: 'relation "cost_entries" does not exist' } };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "insert", "upsert", "update", "delete", "eq", "is", "order"]) q[m] = () => q;
  q.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return q;
};

// Step 5's month-to-date Tesla estimate (lib/server/usage.ts), as /admin reads it.
let teslaMonth: { costUsd: number; counted: boolean } = { costUsd: 0, counted: false };
const teslaCalls: number[] = [];
mock.module("@/lib/server/usage", () => ({
  accountKinds: async (now: number) => {
    teslaCalls.push(now);
    return { kinds: [], signals: 0, usage: { categories: [], costUsd: teslaMonth.costUsd }, counted: teslaMonth.counted };
  },
}));

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({
  db: () => {
    const client = fake.client();
    return missing ? { ...client, from: (t: string) => (t.startsWith("cost_") ? missingTable() : client.from(t)) } : client;
  },
}));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tiu_session" && cookie ? { value: cookie } : undefined) }),
  headers: async () => new Headers(),
}));
mock.module("next/cache", () => ({
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
const { removeEntry, saveBudget, saveEntry, saveRate } = await import("@/app/admin/costs/actions");
const { loadCosts, rateOf } = await import("@/lib/server/costs");
const { readVercel } = await import("@/lib/server/costs/vercel");

const user = (id: number, role = "user") => ({
  id,
  tesla_sub: `made-up-${id}`,
  status: "approved",
  role,
  sessions_valid_after: "-infinity",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const realFetch = globalThis.fetch;
const fetched: { url: string; auth: string | null }[] = [];

function stubFetch(handler: (url: URL) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    fetched.push({ url: url.toString(), auth: new Headers(init?.headers).get("authorization") });
    return handler(url);
  }) as typeof fetch;
}

beforeEach(async () => {
  missing = false;
  teslaMonth = { costUsd: 0, counted: false };
  teslaCalls.length = 0;
  tagsUpdated.length = 0;
  fetched.length = 0;
  delete process.env.VERCEL_API_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.USD_INR;
  fake = new FakeDb({ users: [user(1, "admin"), user(2)], cost_entries: [], cost_settings: [] });
  cookie = await createSession(1);
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const entry = { amount: "899", currency: "INR", renewsOn: "2027-01-15" };

describe("who may save", () => {
  test("no session, a forged cookie, or a non-admin is refused and nothing is written", async () => {
    for (const set of [
      () => (cookie = undefined),
      () => (cookie = `1.${Date.now()}.${Math.floor(Date.now() / 1000) + 3600}.${"0".repeat(64)}`),
      async () => (cookie = await createSession(2)),
    ]) {
      await set();
      expect(await saveEntry("domain", null, form(entry))).toBe("Not allowed.");
      expect(await saveEntry("new", null, form({ ...entry, name: "Email", period: "monthly" }))).toBe("Not allowed.");
      expect(await removeEntry("1", null)).toBe("Not allowed.");
      expect(await saveRate(null, form({ rate: "90" }))).toBe("Not allowed.");
      expect(await saveBudget(null, form({ googleBudget: "5" }))).toBe("Not allowed.");
    }
    expect(fake.rows("cost_entries")).toEqual([]);
    expect(fake.rows("cost_settings")).toEqual([]);
  });

  test("the role is read again on every save", async () => {
    expect(await saveRate(null, form({ rate: "90" }))).toBeNull();
    fake.rows("users")[0].role = "user";
    expect(await saveRate(null, form({ rate: "91" }))).toBe("Not allowed.");
    expect(fake.rows("cost_settings")[0].value).toEqual({ rate: 90 });
  });

  test("a bound target that isn't a service, new or an id is refused", async () => {
    for (const target of ["vercel", "toString", "0", "-1", "1.5", "1e3", ""]) {
      expect(await saveEntry(target, null, form(entry))).toBe("Not allowed.");
    }
    expect(await removeEntry("domain", null)).toBe("Not allowed.");
  });
});

describe("saving", () => {
  test("a built-in service keeps one row, with its own name, period and link", async () => {
    expect(await saveEntry("domain", null, form({ ...entry, name: "Evil", period: "monthly", link: "https://evil.example" }))).toBeNull();
    expect(await saveEntry("domain", null, form({ ...entry, amount: "999" }))).toBeNull();
    const rows = fake.rows("cost_entries");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ service: "domain", name: "Domain", amount: 999, currency: "INR", period: "yearly", renews_on: "2027-01-15", link: null });
    expect(tagsUpdated).toContain("admin-costs");
  });

  test("added rows are created, changed and removed by id; built-in rows can't be by id", async () => {
    expect(await saveEntry("new", null, form({ name: "Email", amount: "1.50", currency: "USD", period: "monthly", link: "https://example.com/billing" }))).toBeNull();
    fake.rows("cost_entries")[0].id = 7;
    expect(await saveEntry("7", null, form({ name: "Email", amount: "2", currency: "USD", period: "monthly" }))).toBeNull();
    expect(fake.rows("cost_entries")[0]).toMatchObject({ amount: 2, link: null });
    await saveEntry("fly", null, form({ amount: "3", currency: "USD" }));
    fake.rows("cost_entries")[1].id = 8;
    expect(await removeEntry("8", null)).toBe("That row is gone. Reload to see it.");
    expect(await saveEntry("8", null, form({ name: "Hijack", amount: "0", currency: "USD", period: "monthly" }))).toBe("That row is gone. Reload to see it.");
    expect(fake.rows("cost_entries")[1]).toMatchObject({ service: "fly", amount: 3 });
    expect(await removeEntry("7", null)).toBeNull();
    expect(fake.rows("cost_entries").map((r) => r.service)).toEqual(["fly"]);
  });

  test("bad input is refused with a message, and a javascript: link never reaches the database", async () => {
    expect(await saveEntry("new", null, form({ name: "X", amount: "1", currency: "USD", period: "monthly", link: "javascript:alert(1)" }))).toBe("Links must start with https://");
    expect(await saveEntry("domain", null, form({ ...entry, amount: "-1" }))).toBe("Enter an amount, like 1200 or 12.50");
    expect(await saveRate(null, form({ rate: "0" }))).toBe("Enter the rate above 0");
    expect(fake.rows("cost_entries")).toEqual([]);
  });

  test("the rate keeps when it was set; an empty budget clears it", async () => {
    expect(await saveRate(null, form({ rate: "83.5" }))).toBeNull();
    expect(await saveBudget(null, form({ googleBudget: "5" }))).toBeNull();
    expect(fake.rows("cost_settings").map((r) => r.key)).toEqual(["usd_inr", "google_budget_usd"]);
    expect(await saveBudget(null, form({ googleBudget: "" }))).toBeNull();
    expect(fake.rows("cost_settings").map((r) => r.key)).toEqual(["usd_inr"]);
  });

  test("before the migration, saving says so", async () => {
    missing = true;
    expect(await saveEntry("domain", null, form(entry))).toBe("Apply the costs migration first.");
    expect(await saveRate(null, form({ rate: "90" }))).toBe("Apply the costs migration first.");
  });
});

describe("the rate", () => {
  test("saved, then USD_INR, then 84", () => {
    expect(rateOf({ value: { rate: 83 }, updated_at: "2026-10-20T00:00:00Z" }, "90")).toEqual({ value: 83, from: "saved", setAt: "2026-10-20T00:00:00Z" });
    expect(rateOf(undefined, "90")).toEqual({ value: 90, from: "env", setAt: null });
    expect(rateOf(undefined, "nope")).toEqual({ value: 84, from: "default", setAt: null });
  });
});

describe("the page's data", () => {
  const NOW = Date.parse("2026-10-26T06:30:00Z");
  const byId = async () => Object.fromEntries((await loadCosts(NOW)).lines.map((l) => [l.id, l]));

  test("renders before the migration: fixed entries not set, Vercel to connect, usage not tracked", async () => {
    missing = true;
    const page = await loadCosts(NOW);
    expect(page.ready).toBe(false);
    expect(page.rate).toEqual({ value: 84, from: "default", setAt: null });
    const lines = Object.fromEntries(page.lines.map((l) => [l.id, l]));
    expect(lines.vercel.state).toBe("connect");
    expect(lines.tesla).toMatchObject({ state: "not-tracked", allowance: 10, resetsOn: "2026-11-01" });
    expect(lines.google.state).toBe("not-tracked");
    for (const id of ["supabase", "fly", "domain"]) expect(lines[id].state).toBe("not-set");
    expect(fetched).toEqual([]);
  });

  test("Tesla is step 5's month-to-date estimate against the $10 credit, and not tracked before its migration", async () => {
    expect((await byId()).tesla).toMatchObject({ amount: null, state: "not-tracked" });
    teslaMonth = { costUsd: 12.37, counted: true };
    expect((await byId()).tesla).toMatchObject({ amount: 12.37, state: "ok", source: "estimated", allowance: 10, resetsOn: "2026-11-01" });
    expect(teslaCalls.at(-1)).toBe(NOW);
  });

  test("a saved entry shows, its past renewal rolled on", async () => {
    fake.rows("cost_entries").push({ id: 1, service: "domain", name: "Domain", amount: "899.00", currency: "INR", period: "yearly", renews_on: "2025-11-07", link: null, updated_at: "x" });
    expect((await byId()).domain).toMatchObject({ amount: 899, resetsOn: "2026-11-07", state: "ok", source: "fixed" });
  });

  test("Vercel live: sums the charges with the token in the header only, and keeps the read", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    stubFetch((url) =>
      url.pathname === "/v1/billing/charges"
        ? new Response('{"BilledCost":20,"BillingCurrency":"USD"}\n{"BilledCost":"1.40","BillingCurrency":"USD"}\n')
        : Response.json({ billing: { plan: "pro" } }),
    );
    const lines = await byId();
    expect(lines.vercel).toMatchObject({ amount: 21.4, state: "ok", note: "Pro plan", source: "live" });
    expect(fetched.every((f) => f.auth === "Bearer made-up-token" && !f.url.includes("made-up-token"))).toBe(true);
    const charges = new URL(fetched.find((f) => f.url.includes("/billing/charges"))!.url);
    expect(charges.searchParams.get("teamId")).toBe("team_madeup");
    expect(charges.searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    expect(fake.rows("cost_settings").find((r) => r.key === "snapshot:vercel")?.value).toMatchObject({ amount: 21.4, plan: "pro" });
  });

  test("Vercel failing shows the last value read, or Unavailable; the token is never logged", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    const logged: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
    try {
      stubFetch(() => new Response("forbidden: made-up-token", { status: 403 }));
      expect((await byId()).vercel).toMatchObject({ amount: null, state: "unavailable" });
      fake.rows("cost_settings").push({ key: "snapshot:vercel", value: { amount: 18.2, plan: "pro", fetchedAt: "2026-10-25T10:00:00Z" }, updated_at: "x" });
      expect((await byId()).vercel).toMatchObject({ amount: 18.2, state: "stale", asOf: "2026-10-25T10:00:00Z" });
      stubFetch(() => {
        throw Object.assign(new Error("made-up-token timed out"), { name: "TimeoutError" });
      });
      expect((await readVercel("2026-10-01T00:00:00.000Z"))).toEqual({ kind: "error", status: "timeout" });
    } finally {
      console.warn = warn;
    }
    expect(logged.some((l) => l.includes("(403)"))).toBe(true);
    expect(logged.some((l) => l.includes("made-up-token"))).toBe(false);
  });

  test("a malformed charges body reads as unavailable, not $0", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    stubFetch(() => new Response("<html>oops</html>"));
    expect((await byId()).vercel.state).toBe("unavailable");
  });
});
