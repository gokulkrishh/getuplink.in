import { beforeEach, describe, expect, mock, test } from "bun:test";

// Tesla's token endpoint as the outage on 25 Oct 2026 suggests it behaves: a refresh token works once,
// and presenting a spent one revokes everything issued from it, the pair just stored included.
const tesla = {
  requests: 0,
  valid: new Set<string>(),
  spent: new Set<string>(),
  access: new Set<string>(),
  next: 0,
  issue() {
    const n = ++this.next;
    this.valid.add(`r${n}`);
    this.access.add(`a${n}`);
    return { access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 28_800 };
  },
};

// The oauth_tokens row, behind enough of supabase-js's query builder for lib/server/tesla.ts.
type Row = Record<string, string | null>;
let row: Row;
const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private patch: Row | null = null;
  constructor(private columns?: string) {}
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  select(columns: string) {
    this.columns ??= columns;
    return this;
  }
  eq(column: string, value: string) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  or(expression: string) {
    const parts = expression.split(",").map((part) => {
      const [column, op, ...rest] = part.split(".");
      const value = rest.join(".");
      return (r: Row) => (op === "is" ? r[column] === null : r[column] !== null && Date.parse(r[column]!) < Date.parse(value));
    });
    this.filters.push((r) => parts.some((p) => p(r)));
    return this;
  }
  private async run() {
    await tick();
    const hit = this.filters.every((f) => f(row));
    if (this.patch && hit) row = { ...row, ...this.patch };
    return hit;
  }
  async maybeSingle() {
    return { data: (await this.run()) ? { ...row } : null, error: null };
  }
  then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
    return this.run().then((hit) => resolve({ data: hit ? [{ ...row }] : [], error: null }));
  }
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => ({ from: () => new Query() }) }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("@/lib/server/connector-token", () => ({ revokeConnectorToken: async () => {} }));
mock.module("@/lib/server/receipts", () => ({ deleteAllInvoices: async () => {} }));
process.env.TESLA_CLIENT_ID = "client";

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (url.includes("/oauth2/v3/token")) {
    tesla.requests++;
    const token = new URLSearchParams(String(init?.body)).get("refresh_token")!;
    if (!tesla.valid.has(token)) {
      // Reuse of a spent token: revoke the whole chain.
      if (tesla.spent.has(token)) {
        tesla.valid.clear();
        tesla.access.clear();
      }
      return new Response(JSON.stringify({ error: "login_required", error_description: "The refresh_token is invalid" }), { status: 401 });
    }
    tesla.valid.delete(token);
    tesla.spent.add(token);
    return Response.json(tesla.issue());
  }
  const bearer = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
  return bearer && tesla.access.has(bearer) ? Response.json({ response: "ok" }) : new Response("unauthorized", { status: 401 });
}) as typeof fetch;

const { fleetGet } = await import("@/lib/server/tesla");

beforeEach(() => {
  Object.assign(tesla, { requests: 0, valid: new Set(), spent: new Set(), access: new Set(), next: 0 });
  const first = tesla.issue();
  // The access token runs out within the refresh margin, so the next call refreshes.
  row = {
    provider: "tesla",
    access_token_enc: `enc:${first.access_token}`,
    refresh_token_enc: `enc:${first.refresh_token}`,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    refreshing_until: null,
  };
});

describe("Tesla token refresh", () => {
  test("concurrent calls in one instance share a single refresh", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => fleetGet<string>("/api/1/vehicles")));
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(tesla.requests).toBe(1);
    expect(row.refresh_token_enc).toBe("enc:r2");
    expect(tesla.valid.has("r2")).toBe(true);
    expect(row.refreshing_until).toBeNull();
  });

  test("waits for another instance's refresh instead of spending the same token", async () => {
    // Another instance holds the lease and stores new tokens a moment later.
    row.refreshing_until = new Date(Date.now() + 30_000).toISOString();
    setTimeout(() => {
      const next = tesla.issue();
      tesla.valid.delete("r1");
      tesla.spent.add("r1");
      row = { ...row, access_token_enc: `enc:${next.access_token}`, refresh_token_enc: `enc:${next.refresh_token}`, refreshing_until: null };
    }, 700);
    expect(await fleetGet<string>("/api/1/vehicles")).toBe("ok");
    expect(tesla.requests).toBe(0);
    expect(tesla.valid.has("r2")).toBe(true);
  });

  test("takes over a lease left by a request that died", async () => {
    row.refreshing_until = new Date(Date.now() - 1_000).toISOString();
    expect(await fleetGet<string>("/api/1/vehicles")).toBe("ok");
    expect(tesla.requests).toBe(1);
    expect(row.refresh_token_enc).toBe("enc:r2");
  });
});
