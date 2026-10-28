import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import apis from "./fixtures/cost-apis.json";
import { FakeDb } from "./fake-db";

// /admin/costs: who may save, what is saved, and the providers failing soft. Made-up accounts, projects
// and tokens only: user 1 is the admin, user 2 an approved owner.

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

mock.module("server-only", () => ({}));

// Step 5's month-to-date Tesla estimate (lib/server/usage.ts), as /admin reads it. Bun's module mocks are
// process-wide, so the rest of the module stays real, and accountKinds is stubbed only while this file's
// tests run: test/api-usage.test.ts tests the real one.
const realUsage = { ...(await import("@/lib/server/usage")) };
let stubTesla = false;
let teslaMonth: { costUsd: number; counted: boolean } = { costUsd: 0, counted: false };
const teslaCalls: number[] = [];
mock.module("@/lib/server/usage", () => ({
  ...realUsage,
  accountKinds: async (now: number) => {
    if (!stubTesla) return realUsage.accountKinds(now);
    teslaCalls.push(now);
    return { kinds: [], signals: 0, usage: { categories: [], costUsd: teslaMonth.costUsd }, counted: teslaMonth.counted };
  },
}));
mock.module("@/lib/server/supabase", () => ({
  db: () => {
    const client = fake.client();
    return missing ? { ...client, from: (t: string) => (t.startsWith("cost_") || t === "google_usage" ? missingTable() : client.from(t)) } : client;
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

// A made-up hosted project, matching the fixture's first project.
process.env.SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
for (const name of ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
  process.env[name] ??= "test";
}
process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";

const { createSession } = await import("@/lib/session");
const { removeEntry, saveBudget, saveEntry } = await import("@/app/admin/costs/actions");
const { loadCosts } = await import("@/lib/server/costs");
const { readVercel } = await import("@/lib/server/costs/vercel");
const { readSupabase, supabaseLine } = await import("@/lib/server/costs/supabase-billing");
const { flyAuthorization, readFly } = await import("@/lib/server/costs/fly");
const { readDomain } = await import("@/lib/server/costs/domain");
const { openRouterParts, readOpenRouter } = await import("@/lib/server/costs/openrouter");

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

// The providers as documented, from the fixtures. Anything else fails, so no test reaches the network.
function providers(url: URL): Response {
  if (url.host === "rdap.nixiregistry.in" || url.host === "rdap.org") return Response.json(apis.rdap);
  if (url.host === "api.machines.dev") {
    if (url.pathname.endsWith("/machines")) return Response.json(apis.flyMachines);
    if (url.pathname.endsWith("/volumes")) return Response.json(apis.flyVolumes);
    if (url.pathname.endsWith("/ip_assignments")) return Response.json(apis.flyIps);
  }
  if (url.host === "api.supabase.com") {
    if (url.pathname === "/v1/projects") return Response.json(apis.supabaseProjects);
    if (url.pathname === "/v1/organizations/made-up-org") return Response.json(apis.supabaseOrg);
    if (/^\/v1\/projects\/[a-z]{20}\/billing\/addons$/.test(url.pathname)) return Response.json(apis.supabaseAddons);
  }
  if (url.host === "openrouter.ai") {
    if (url.pathname === "/api/v1/key") return Response.json(apis.openRouterKey);
    if (url.pathname === "/api/v1/credits") return Response.json(apis.openRouterCredits);
  }
  return new Response("not stubbed", { status: 599 });
}

beforeEach(async () => {
  stubTesla = true;
  missing = false;
  teslaMonth = { costUsd: 0, counted: false };
  teslaCalls.length = 0;
  tagsUpdated.length = 0;
  fetched.length = 0;
  for (const name of ["VERCEL_API_TOKEN", "VERCEL_TEAM_ID", "SUPABASE_ACCESS_TOKEN", "FLY_API_TOKEN", "OPENROUTER_API_KEY"]) delete process.env[name];
  fake = new FakeDb({ users: [user(1, "admin"), user(2)], cost_entries: [], cost_settings: [] });
  cookie = await createSession(1);
  stubFetch(providers);
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(() => {
  stubTesla = false;
});

// Logs captured while `run` runs.
async function logs(run: () => Promise<unknown>): Promise<string[]> {
  const logged: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await run();
  } finally {
    console.warn = warn;
  }
  return logged;
}

const entry = { name: "Email", amount: "1.50", period: "monthly", renewsOn: "2027-01-15" };

describe("who may save", () => {
  test("no session, a forged cookie, or a non-admin is refused and nothing is written", async () => {
    for (const set of [
      () => (cookie = undefined),
      () => (cookie = `1.${Date.now()}.${Math.floor(Date.now() / 1000) + 3600}.${"0".repeat(64)}`),
      async () => (cookie = await createSession(2)),
    ]) {
      await set();
      expect(await saveEntry("new", null, form(entry))).toBe("Not allowed.");
      expect(await saveEntry("1", null, form(entry))).toBe("Not allowed.");
      expect(await removeEntry("1", null)).toBe("Not allowed.");
      expect(await saveBudget(null, form({ googleBudget: "5" }))).toBe("Not allowed.");
    }
    expect(fake.rows("cost_entries")).toEqual([]);
    expect(fake.rows("cost_settings")).toEqual([]);
  });

  test("the role is read again on every save", async () => {
    expect(await saveBudget(null, form({ googleBudget: "5" }))).toBeNull();
    fake.rows("users")[0].role = "user";
    expect(await saveBudget(null, form({ googleBudget: "6" }))).toBe("Not allowed.");
    expect(fake.rows("cost_settings")[0].value).toEqual({ usd: 5 });
  });

  test("the built-in services can't be typed in any more, and odd targets are refused", async () => {
    for (const target of ["fly", "supabase", "domain", "vercel", "toString", "0", "-1", "1.5", "1e3", ""]) {
      expect(await saveEntry(target, null, form(entry))).toBe("Not allowed.");
    }
    expect(await removeEntry("domain", null)).toBe("Not allowed.");
    expect(fake.rows("cost_entries")).toEqual([]);
  });
});

describe("saving", () => {
  test("added rows are created, changed and removed by id, in dollars; old service rows can't be by id", async () => {
    expect(await saveEntry("new", null, form({ ...entry, link: "https://example.com/billing" }))).toBeNull();
    expect(fake.rows("cost_entries")[0]).toMatchObject({ name: "Email", amount: 1.5, currency: "USD", period: "monthly" });
    expect(fake.rows("cost_entries")[0].service).toBeUndefined();
    expect(tagsUpdated).toContain("admin-costs");
    fake.rows("cost_entries")[0].id = 7;
    expect(await saveEntry("7", null, form({ ...entry, amount: "2" }))).toBeNull();
    expect(fake.rows("cost_entries")[0]).toMatchObject({ amount: 2, link: null });
    fake.rows("cost_entries").push({ id: 8, service: "fly", name: "Fly.io", amount: 3, currency: "USD", period: "monthly", renews_on: null, link: null, updated_at: "x" });
    expect(await removeEntry("8", null)).toBe("That row is gone. Reload to see it.");
    expect(await saveEntry("8", null, form({ ...entry, name: "Hijack" }))).toBe("That row is gone. Reload to see it.");
    expect(fake.rows("cost_entries")[1]).toMatchObject({ service: "fly", amount: 3 });
    expect(await removeEntry("7", null)).toBeNull();
    expect(fake.rows("cost_entries").map((r) => r.service)).toEqual(["fly"]);
  });

  test("bad input is refused with a message: rupees, a javascript: link", async () => {
    expect(await saveEntry("new", null, form({ ...entry, link: "javascript:alert(1)" }))).toBe("Use a link that starts with https.");
    expect(await saveEntry("new", null, form({ ...entry, currency: "INR" }))).toBe("Enter amounts in dollars.");
    expect(await saveEntry("new", null, form({ ...entry, amount: "₹500" }))).toBe("Enter an amount in dollars, like 12.50.");
    expect(fake.rows("cost_entries")).toEqual([]);
  });

  test("an empty budget clears it", async () => {
    expect(await saveBudget(null, form({ googleBudget: "5" }))).toBeNull();
    expect(fake.rows("cost_settings").map((r) => r.key)).toEqual(["google_budget_usd"]);
    expect(await saveBudget(null, form({ googleBudget: "" }))).toBeNull();
    expect(fake.rows("cost_settings")).toEqual([]);
  });

  test("before the migration, saving says so", async () => {
    missing = true;
    expect(await saveEntry("new", null, form(entry))).toBe("Apply the costs migration first.");
    expect(await saveBudget(null, form({ googleBudget: "5" }))).toBe("Apply the costs migration first.");
  });
});

describe("the page's data", () => {
  const NOW = Date.parse("2026-10-26T06:30:00Z");
  const byId = async () => Object.fromEntries((await loadCosts(NOW)).lines.map((l) => [l.id, l]));

  test("renders before the migration: tokens to connect, usage not tracked, the domain from RDAP", async () => {
    missing = true;
    const page = await loadCosts(NOW);
    expect(page.ready).toBe(false);
    const lines = Object.fromEntries(page.lines.map((l) => [l.id, l]));
    for (const id of ["vercel", "supabase", "fly", "openrouter"]) expect(lines[id]).toMatchObject({ state: "connect", amount: null });
    expect(lines.tesla).toMatchObject({ state: "not-tracked", allowance: 10, resetsOn: "2026-11-01" });
    expect(lines.google.state).toBe("not-tracked");
    expect(lines.domain).toMatchObject({ state: "ok", source: "estimated" });
    // Only the public RDAP call: nothing is sent without a token.
    expect(fetched.map((f) => new URL(f.url).host)).toEqual(["rdap.nixiregistry.in"]);
    expect(fetched[0].auth).toBeNull();
  });

  test("the order: Vercel, Supabase, Fly.io, Tesla, Google, OpenRouter, the domain, then added rows", async () => {
    fake.rows("cost_entries").push({ id: 3, service: null, name: "Email", amount: "1.50", currency: "USD", period: "monthly", renews_on: null, link: null, updated_at: "x" });
    expect((await loadCosts(NOW)).lines.map((l) => l.id)).toEqual(["vercel", "supabase", "fly", "tesla", "google", "openrouter", "domain", "entry-3"]);
  });

  test("the domain: Namecheap's renewal a year, renewing on RDAP's expiry", async () => {
    expect((await byId()).domain).toMatchObject({ amount: 13.42, period: "yearly", resetsOn: "2028-10-21", source: "estimated", state: "ok", note: "getuplink.in" });
    expect(fetched[0].url).toBe("https://rdap.nixiregistry.in/rdap/domain/getuplink.in");
  });

  test("RDAP is asked with a User-Agent, the registry first, then rdap.org", async () => {
    const asked: { host: string; accept: string | null; agent: string | null }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      asked.push({ host: new URL(String(input)).host, accept: headers.get("accept"), agent: headers.get("user-agent") });
      return asked.length === 1 ? new Response("down", { status: 503 }) : Response.json(apis.rdap);
    }) as typeof fetch;
    expect(await readDomain()).toMatchObject({ kind: "ok", expires: "2028-10-21" });
    expect(asked.map((a) => a.host)).toEqual(["rdap.nixiregistry.in", "rdap.org"]);
    for (const a of asked) expect(a).toMatchObject({ accept: "application/rdap+json", agent: "Uplink costs (+https://getuplink.in)" });
  });

  test("RDAP refused (403) by both: the price stays, the date is unavailable, one warning and nothing thrown", async () => {
    const forbidden = () => Response.json(apis.rdapForbidden.body, { status: apis.rdapForbidden.status });
    stubFetch((url) => (url.host.startsWith("rdap.") ? forbidden() : providers(url)));
    expect(await logs(async () => expect(await readDomain()).toEqual({ kind: "error" }))).toEqual(["Costs read failed: RDAP 403, 403"]);
    const logged = await logs(async () =>
      expect((await byId()).domain).toMatchObject({ amount: 13.42, state: "ok", resetsOn: null, note: "getuplink.in. Renewal date unavailable" }),
    );
    expect(logged.filter((l) => l.includes("RDAP") || l.startsWith("Domain"))).toEqual(["Costs read failed: RDAP 403, 403"]);
  });

  test("an answer without an expiry counts as a failure too", async () => {
    stubFetch((url) => (url.host.startsWith("rdap.") ? Response.json({ objectClassName: "domain", events: [] }) : providers(url)));
    const logged = await logs(async () => expect(await readDomain()).toEqual({ kind: "error" }));
    expect(logged).toEqual(["Costs read failed: RDAP shape, shape"]);
  });

  test("old rows for Fly.io, Supabase and the domain are ignored; an old rupee row shows in dollars, marked ≈", async () => {
    fake.rows("cost_entries").push(
      { id: 1, service: "domain", name: "Domain", amount: "899.00", currency: "INR", period: "yearly", renews_on: "2025-11-07", link: null, updated_at: "x" },
      { id: 2, service: "supabase", name: "Supabase", amount: "25.00", currency: "USD", period: "monthly", renews_on: null, link: null, updated_at: "x" },
      { id: 4, service: null, name: "Email", amount: "840.00", currency: "INR", period: "yearly", renews_on: "2025-11-07", link: null, updated_at: "x" },
    );
    const page = await loadCosts(NOW);
    const lines = Object.fromEntries(page.lines.map((l) => [l.id, l]));
    expect(lines.domain.amount).toBe(13.42);
    expect(lines.supabase.state).toBe("connect");
    expect(lines["entry-4"]).toMatchObject({ amount: 10, approx: true, resetsOn: "2026-11-07", source: "fixed" });
    expect(Object.keys(page.edit)).toEqual(["entry-4"]);
    expect(page.edit["entry-4"].values).toMatchObject({ amount: "10", period: "yearly" });
  });

  test("Supabase: the org's plan and its projects' add-ons, with the token in the header only", async () => {
    process.env.SUPABASE_ACCESS_TOKEN = "made-up-supabase-token";
    const line = (await byId()).supabase;
    expect(line).toMatchObject({ state: "ok", source: "estimated", note: "Pro plan, 2 add-ons" });
    expect(line.amount).toBeCloseTo(25 + 5 + 10 + 0.0055 * 730, 10);
    const supabase = fetched.filter((f) => f.url.startsWith("https://api.supabase.com/"));
    expect(supabase.every((f) => f.auth === "Bearer made-up-supabase-token" && !f.url.includes("made-up-supabase-token"))).toBe(true);
    // Only this project's org: its two projects' add-ons, not the other org's.
    expect(supabase.map((f) => new URL(f.url).pathname)).toEqual([
      "/v1/projects",
      "/v1/organizations/made-up-org",
      "/v1/projects/abcdefghijklmnopqrst/billing/addons",
      "/v1/projects/bcdefghijklmnopqrstu/billing/addons",
    ]);
  });

  test("Supabase on Free makes no add-on calls", async () => {
    process.env.SUPABASE_ACCESS_TOKEN = "made-up-supabase-token";
    stubFetch((url) => (url.pathname.startsWith("/v1/organizations/") ? Response.json({ ...apis.supabaseOrg, plan: "free" }) : providers(url)));
    expect((await byId()).supabase).toMatchObject({ amount: 0, note: "Free plan", state: "ok" });
    expect(fetched.some((f) => f.url.includes("/billing/addons"))).toBe(false);
  });

  test("Supabase failing throws, so the cache keeps the last read; with none it's Unavailable, and the token is never logged", async () => {
    process.env.SUPABASE_ACCESS_TOKEN = "made-up-supabase-token";
    stubFetch((url) => (url.host === "api.supabase.com" ? new Response("bad token made-up-supabase-token", { status: 401 }) : providers(url)));
    const logged = await logs(async () => {
      await expect(readSupabase()).rejects.toThrow("Supabase 401");
      expect((await byId()).supabase).toMatchObject({ amount: null, state: "unavailable" });
    });
    expect(logged).toContain("Costs read failed: Supabase 401");
    expect(logged).toContain("Supabase costs unavailable");
    expect(logged.some((l) => l.includes("made-up-supabase-token"))).toBe(false);
    // The project isn't one the token can see.
    stubFetch((url) => (url.pathname === "/v1/projects" ? Response.json([apis.supabaseProjects[2]]) : providers(url)));
    await expect(readSupabase()).rejects.toThrow("Supabase shape");
  });

  test("a read the cache kept past 7 hours says when it was read", () => {
    const fetchedAt = new Date(NOW - 2 * 86_400_000).toISOString();
    expect(supabaseLine({ kind: "ok", usd: 25, note: "Pro plan", fetchedAt }, NOW)).toMatchObject({ amount: 25, state: "stale", asOf: fetchedAt });
    expect(supabaseLine({ kind: "ok", usd: 25, note: "Pro plan", fetchedAt: new Date(NOW - 3_600_000).toISOString() }, NOW)).toMatchObject({ state: "ok", asOf: undefined });
  });

  test("Fly.io: the telemetry app's machines, volumes and IPs, always on", async () => {
    process.env.FLY_API_TOKEN = "FlyV1 fm2_made-up";
    const line = (await byId()).fly;
    expect(line).toMatchObject({ state: "ok", source: "estimated", note: "2 machines, always on" });
    expect(line.amount).toBeCloseTo(8.48, 10);
    const fly = fetched.filter((f) => f.url.startsWith("https://api.machines.dev/"));
    expect(fly.map((f) => new URL(f.url).pathname).sort()).toEqual([
      "/v1/apps/uplink-telemetry/ip_assignments",
      "/v1/apps/uplink-telemetry/machines",
      "/v1/apps/uplink-telemetry/volumes",
    ]);
    expect(fly.every((f) => f.auth === "FlyV1 fm2_made-up")).toBe(true);
  });

  test("Fly.io: a bare token is sent as Bearer; under $5 says it may be waived", async () => {
    expect(flyAuthorization("made-up")).toBe("Bearer made-up");
    expect(flyAuthorization("FlyV1 fm2_x")).toBe("FlyV1 fm2_x");
    process.env.FLY_API_TOKEN = "made-up";
    stubFetch((url) =>
      url.host === "api.machines.dev" && url.pathname.endsWith("/machines") ? Response.json([apis.flyMachines[0]]) : url.pathname.endsWith("/ip_assignments") ? Response.json({ ips: [] }) : url.pathname.endsWith("/volumes") ? Response.json([]) : providers(url),
    );
    expect((await byId()).fly).toMatchObject({ amount: 3.69, note: "1 machine, always on. Fly may waive bills under $5" });
  });

  test("OpenRouter: the key's month as OpenRouter counts it, with its limit and the account's credit", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-made-up";
    expect((await byId()).openrouter).toMatchObject({ amount: 1.25, state: "ok", source: "live", resetsOn: "2026-11-01" });
    const asked = fetched.filter((f) => f.url.startsWith("https://openrouter.ai/"));
    expect(asked.map((f) => new URL(f.url).pathname).sort()).toEqual(["/api/v1/credits", "/api/v1/key"]);
    expect(asked.every((f) => f.auth === "Bearer sk-or-made-up")).toBe(true);
    expect(openRouterParts(await readOpenRouter())).toEqual([
      { label: "Total spent", value: "$1.25" },
      { label: "Key limit left", value: "$3.75 of $5.00" },
      { label: "Credit left", value: "$12.00 of $30.00" },
    ]);
  });

  test("OpenRouter: the credit read failing keeps the month; the key read failing is unavailable", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-made-up";
    stubFetch((url) => (url.pathname === "/api/v1/credits" ? new Response("no", { status: 403 }) : providers(url)));
    const read = await readOpenRouter();
    expect(read).toMatchObject({ kind: "ok", usd: 1.25, creditUsd: null });
    expect(openRouterParts(read).map((p) => p.label)).toEqual(["Total spent", "Key limit left"]);
    stubFetch((url) => (url.host === "openrouter.ai" ? new Response("unauthorized", { status: 401 }) : providers(url)));
    await expect(readOpenRouter()).rejects.toThrow("OpenRouter 401");
    await logs(async () => expect((await byId()).openrouter.state).toBe("unavailable"));
  });

  test("Fly.io failing throws, so the cache keeps the last read; the token is never logged", async () => {
    process.env.FLY_API_TOKEN = "FlyV1 fm2_made-up";
    stubFetch((url) => (url.host === "api.machines.dev" ? new Response("unauthorized FlyV1 fm2_made-up", { status: 401 }) : providers(url)));
    await expect(readFly()).rejects.toThrow("Fly.io 401");
    const logged = await logs(async () => expect((await byId()).fly.state).toBe("unavailable"));
    expect(logged.some((l) => l.includes("fm2_made-up"))).toBe(false);
    stubFetch(() => {
      throw Object.assign(new Error("FlyV1 fm2_made-up timed out"), { name: "TimeoutError" });
    });
    await expect(readFly()).rejects.toThrow("Fly.io timeout");
  });

  test("Google is the naming sheet's counted calls this month, by SKU, past each free allowance", async () => {
    fake.rows("google_usage").push(
      { month: "2026-10-01", sku: "nearbySearchPro", count: 36_000 },
      { month: "2026-10-01", sku: "geocoding", count: 120 },
      // Last month's and unknown SKUs don't count.
      { month: "2026-09-01", sku: "nearbySearchPro", count: 99_000 },
      { month: "2026-10-01", sku: "somethingElse", count: 5 },
    );
    // 1,000 Nearby Search Pro calls past the 35,000 free, at $9.60 per 1,000; Geocoding is inside its 70,000.
    expect((await byId()).google).toMatchObject({ state: "ok", amount: 9.6, source: "estimated" });
  });

  test("Google with no calls yet this month is tracked at zero", async () => {
    expect((await byId()).google).toMatchObject({ state: "ok", amount: 0 });
  });

  test("Tesla is step 5's month-to-date estimate against the $10 credit, and not tracked before its migration", async () => {
    expect((await byId()).tesla).toMatchObject({ amount: null, state: "not-tracked" });
    teslaMonth = { costUsd: 12.37, counted: true };
    expect((await byId()).tesla).toMatchObject({ amount: 12.37, state: "ok", source: "estimated", allowance: 10, resetsOn: "2026-11-01" });
    expect(teslaCalls.at(-1)).toBe(NOW);
  });

  test("Vercel live: sums the charges with the token in the header only, and keeps the read", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    stubFetch((url) =>
      url.host !== "api.vercel.com"
        ? providers(url)
        : url.pathname === "/v1/billing/charges"
          ? new Response('{"BilledCost":20,"BillingCurrency":"USD"}\n{"BilledCost":"1.40","BillingCurrency":"USD"}\n')
          : Response.json({ billing: { plan: "pro" } }),
    );
    const lines = await byId();
    expect(lines.vercel).toMatchObject({ amount: 21.4, state: "ok", note: "Pro plan", source: "live" });
    const vercel = fetched.filter((f) => f.url.startsWith("https://api.vercel.com/"));
    expect(vercel.every((f) => f.auth === "Bearer made-up-token" && !f.url.includes("made-up-token"))).toBe(true);
    const charges = new URL(vercel.find((f) => f.url.includes("/billing/charges"))!.url);
    expect(charges.searchParams.get("teamId")).toBe("team_madeup");
    expect(charges.searchParams.get("from")).toBe("2026-10-01T00:00:00.000Z");
    expect(fake.rows("cost_settings").find((r) => r.key === "snapshot:vercel")?.value).toMatchObject({ amount: 21.4, plan: "pro" });
  });

  test("Vercel failing shows the last value read, or Unavailable; the token is never logged", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    const logged = await logs(async () => {
      stubFetch((url) => (url.host === "api.vercel.com" ? new Response("forbidden: made-up-token", { status: 403 }) : providers(url)));
      expect((await byId()).vercel).toMatchObject({ amount: null, state: "unavailable" });
      fake.rows("cost_settings").push({ key: "snapshot:vercel", value: { amount: 18.2, plan: "pro", fetchedAt: "2026-10-25T10:00:00Z" }, updated_at: "x" });
      expect((await byId()).vercel).toMatchObject({ amount: 18.2, state: "stale", asOf: "2026-10-25T10:00:00Z" });
      stubFetch(() => {
        throw Object.assign(new Error("made-up-token timed out"), { name: "TimeoutError" });
      });
      expect(await readVercel("2026-10-01T00:00:00.000Z")).toEqual({ kind: "error", status: "timeout" });
    });
    expect(logged.some((l) => l.includes("(403)"))).toBe(true);
    expect(logged.some((l) => l.includes("made-up-token"))).toBe(false);
  });

  test("a malformed charges body reads as unavailable, not $0", async () => {
    process.env.VERCEL_API_TOKEN = "made-up-token";
    process.env.VERCEL_TEAM_ID = "team_madeup";
    stubFetch((url) => (url.host === "api.vercel.com" ? new Response("<html>oops</html>") : providers(url)));
    expect((await byId()).vercel.state).toBe("unavailable");
  });
});
