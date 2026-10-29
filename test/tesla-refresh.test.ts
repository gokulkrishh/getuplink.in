import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// Tesla's token endpoint as the outage on 25 Oct 2026 suggests it behaves: a refresh token works once,
// and presenting a spent one revokes everything issued from it, the pair just stored included.
// A slow answer spends the token only when it answers; one given up on (aborted) spends nothing.
const tesla = {
  requests: 0,
  valid: new Set<string>(),
  spent: new Set<string>(),
  access: new Set<string>(),
  next: 0,
  // How long the next refresh takes to answer, once.
  slowMs: 0,
  // The next refresh spends its token and issues a pair, then the connection drops before the answer.
  dropAfterSpend: false,
  // The next refresh is answered with this status (a 5xx: Tesla is down) and spends nothing.
  failStatus: 0,
  // Refresh requests open now per refresh token, and the most ever open at once for one token.
  open: new Map<string, number>(),
  maxOpen: 0,
  issue() {
    const n = ++this.next;
    this.valid.add(`r${n}`);
    this.access.add(`a${n}`);
    return { access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 28_800 };
  },
};

let fake: FakeDb;

// What /api/1/users/region answers for the account signing in (null: Tesla fails), and how often it's asked.
const FLEET_NA_APAC = "https://fleet-api.prd.na.vn.cloud.tesla.com";
let region: string | null = FLEET_NA_APAC;
let regionAsked = 0;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
process.env.TESLA_CLIENT_ID = "client";
process.env.TESLA_CLIENT_SECRET = "secret";
process.env.TESLA_REDIRECT_URI = "https://app.example/api/auth/callback";

const idToken = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;

// Resolves after `ms`, or rejects as fetch does when the request is aborted first.
const answerAfter = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

// Moves fake time on in 10 ms steps, letting every query and request due in each step run.
async function elapse(ms: number) {
  for (let t = 0; t < ms; t += 10) {
    jest.advanceTimersByTime(10);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (url.includes("/oauth2/v3/token")) {
    tesla.requests++;
    const body = new URLSearchParams(String(init?.body));
    // A sign-in: the code names the Tesla account signing in.
    if (body.get("grant_type") === "authorization_code") return Response.json({ ...tesla.issue(), id_token: idToken(body.get("code")!) });
    const token = body.get("refresh_token")!;
    const open = (tesla.open.get(token) ?? 0) + 1;
    tesla.open.set(token, open);
    tesla.maxOpen = Math.max(tesla.maxOpen, open);
    try {
      if (tesla.failStatus) {
        const status = tesla.failStatus;
        tesla.failStatus = 0;
        return new Response("unavailable", { status });
      }
      if (tesla.slowMs) {
        const ms = tesla.slowMs;
        tesla.slowMs = 0;
        await answerAfter(ms, init?.signal);
      }
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
      const pair = tesla.issue();
      if (tesla.dropAfterSpend) {
        tesla.dropAfterSpend = false;
        throw new TypeError("fetch failed");
      }
      return Response.json(pair);
    } finally {
      tesla.open.set(token, tesla.open.get(token)! - 1);
    }
  }
  const bearer = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
  if (url.endsWith("/api/1/users/region")) {
    regionAsked++;
    if (!bearer || !tesla.access.has(bearer) || region === null) return new Response("unavailable", { status: 503 });
    return Response.json({ response: { region: "na", fleet_api_base_url: region } });
  }
  if (!bearer || !tesla.access.has(bearer)) return new Response("unauthorized", { status: 401 });
  // The answer at once and its body 15 s later, as a large PDF on a slow link; the body breaks off on abort.
  if (url.endsWith("/slow-body")) {
    const signal = init?.signal;
    const body = new ReadableStream({
      start(controller) {
        const timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ response: "ok" })));
          controller.close();
        }, 15_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          controller.error(signal.reason);
        });
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/json" } });
  }
  if (url.endsWith("/slow-answer")) await answerAfter(15_000, init?.signal);
  return Response.json({ response: "ok" });
}) as typeof fetch;

const { asOwner } = await import("@/lib/server/data/owner");
const { fleetGet, fleetGetRaw, NotConnectedError, signIn } = await import("@/lib/server/tesla");
// A second copy of the module: another server instance, with its own in-memory refreshes.
const otherInstance = (await import(`@/lib/server/tesla${"?instance=b"}`)) as typeof import("@/lib/server/tesla");
const OWNER: Owner = asOwner(1, "owner");
const OTHER: Owner = asOwner(2, "other");

const soon = () => new Date(Date.now() + 60_000).toISOString(); // inside the refresh margin

function users() {
  return [
    { id: 1, tesla_sub: "owner", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-01T00:00:00Z" },
    { id: 2, tesla_sub: "other", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-02T00:00:00Z" },
    { id: 3, tesla_sub: "waiting", status: "waitlist", sessions_valid_after: "-infinity", created_at: "2026-10-03T00:00:00Z" },
    { id: 4, tesla_sub: "declined", status: "declined", sessions_valid_after: "-infinity", created_at: "2026-10-04T00:00:00Z" },
  ];
}

// Installed before each test, not once at load: another file's afterAll can put the real fetch back while
// this file runs, and then a token request would go to Tesla.
beforeEach(() => {
  globalThis.fetch = fakeFetch;
  Object.assign(tesla, { requests: 0, valid: new Set(), spent: new Set(), access: new Set(), next: 0, slowMs: 0, dropAfterSpend: false, failStatus: 0, open: new Map(), maxOpen: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

const tokensOf = (userId: number) => fake.rows("user_tokens").filter((r) => r.user_id === userId);

describe("Tesla token refresh", () => {
  beforeEach(() => {
    const first = tesla.issue();
    tesla.requests = 0;
    // The access token runs out within the refresh margin, so the next call refreshes.
    fake = new FakeDb({
      users: users(),
      user_tokens: [{ user_id: 1, access_token_enc: `enc:${first.access_token}`, refresh_token_enc: `enc:${first.refresh_token}`, expires_at: soon(), refreshing_until: null }],
    });
  });
  const row = () => tokensOf(1)[0];

  test("concurrent calls in one instance share a single refresh", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => fleetGet<string>(OWNER, "/api/1/vehicles")));
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(tesla.requests).toBe(1);
    expect(row().refresh_token_enc).toBe("enc:r2");
    expect(tesla.valid.has("r2")).toBe(true);
    expect(row().refreshing_until).toBeNull();
  });

  test("waits for another instance's refresh instead of spending the same token", async () => {
    // Another instance holds the lease and stores new tokens a moment later.
    row().refreshing_until = new Date(Date.now() + 30_000).toISOString();
    setTimeout(() => {
      const next = tesla.issue();
      tesla.valid.delete("r1");
      tesla.spent.add("r1");
      Object.assign(row(), { access_token_enc: `enc:${next.access_token}`, refresh_token_enc: `enc:${next.refresh_token}`, refreshing_until: null });
    }, 700);
    expect(await fleetGet<string>(OWNER, "/api/1/vehicles")).toBe("ok");
    expect(tesla.requests).toBe(0);
    expect(tesla.valid.has("r2")).toBe(true);
  });

  test("takes over a lease left by a request that died", async () => {
    row().refreshing_until = new Date(Date.now() - 1_000).toISOString();
    expect(await fleetGet<string>(OWNER, "/api/1/vehicles")).toBe("ok");
    expect(tesla.requests).toBe(1);
    expect(row().refresh_token_enc).toBe("enc:r2");
  });

  test("one user's refresh never touches another's tokens", async () => {
    const theirs = tesla.issue();
    fake.rows("user_tokens").push({ user_id: 2, access_token_enc: `enc:${theirs.access_token}`, refresh_token_enc: `enc:${theirs.refresh_token}`, expires_at: soon(), refreshing_until: null });
    await Promise.all([fleetGet<string>(OWNER, "/api/1/vehicles"), fleetGet<string>(OTHER, "/api/1/vehicles")]);
    expect(tesla.requests).toBe(2);
    expect(tokensOf(1)[0].refresh_token_enc).toBe("enc:r3");
    expect(tokensOf(2)[0].refresh_token_enc).toBe("enc:r4");
    expect(tesla.valid).toEqual(new Set(["r3", "r4"]));
  });

  test("a token answer slower than the lease never overlaps another instance's refresh with the same token", async () => {
    jest.useFakeTimers();
    tesla.slowMs = 35_000;
    const first = fleetGet<string>(OWNER, "/api/1/vehicles").catch((err: Error) => err);
    // The 30 s lease has run out, so another instance takes the refresh over.
    await elapse(31_000);
    const second = otherInstance.fleetGet<string>(OWNER, "/api/1/vehicles").catch((err: Error) => err);
    await elapse(10_000);
    expect(tesla.maxOpen).toBe(1);
    expect(await first).toBeInstanceOf(Error);
    expect(await second).toBe("ok");
    expect(row().refresh_token_enc).toBe("enc:r2");
    expect(tesla.valid).toEqual(new Set(["r2"]));
  });

  test("a refresh lost after it reached Tesla keeps the lease, so no one sends the spent token meanwhile", async () => {
    jest.useFakeTimers();
    tesla.dropAfterSpend = true;
    const first = fleetGet<string>(OWNER, "/api/1/vehicles").catch((err: Error) => err);
    await elapse(1_000);
    expect(await first).toBeInstanceOf(Error);
    expect(Date.parse(row().refreshing_until as string)).toBeGreaterThan(Date.now());
    const second = otherInstance.fleetGet<string>(OWNER, "/api/1/vehicles").catch((err: Error) => err);
    await elapse(20_000);
    expect(tesla.requests).toBe(1);
    expect(tesla.valid).toEqual(new Set(["r2"]));
    // Disconnecting ends the wait.
    Object.assign(row(), { access_token_enc: null, refresh_token_enc: null, expires_at: null, refreshing_until: null });
    await elapse(1_000);
    expect(await second).toBeInstanceOf(otherInstance.NotConnectedError);
  });

  test("a save that fails once is tried again, and the owner stays signed in", async () => {
    let failures = 1;
    fake.failing = ({ table, op, patch }) => table === "user_tokens" && op === "update" && Boolean(patch?.refresh_token_enc) && failures-- > 0;
    expect(await fleetGet<string>(OWNER, "/api/1/vehicles")).toBe("ok");
    expect(row().refresh_token_enc).toBe("enc:r2");
    // The next refresh spends r2, not the spent r1.
    row().expires_at = soon();
    expect(await fleetGet<string>(OWNER, "/api/1/vehicles")).toBe("ok");
    expect(tesla.valid).toEqual(new Set(["r3"]));
  });

  test("an error answer from Tesla's token endpoint frees the lease, so the next call refreshes at once", async () => {
    tesla.failStatus = 503;
    await expect(fleetGet<string>(OWNER, "/api/1/vehicles")).rejects.toThrow("(503)");
    expect(row().refreshing_until).toBeNull();
    expect(await otherInstance.fleetGet<string>(OWNER, "/api/1/vehicles")).toBe("ok");
    expect(tesla.requests).toBe(2);
    expect(row().refresh_token_enc).toBe("enc:r2");
  });

  test("a save that hangs is given up on and tried again well inside the lease", async () => {
    jest.useFakeTimers();
    let stalls = 1;
    fake.stalling = ({ table, op, patch }) => table === "user_tokens" && op === "update" && Boolean(patch?.refresh_token_enc) && stalls-- > 0;
    const call = fleetGet<string>(OWNER, "/api/1/vehicles").catch((err: Error) => err);
    await elapse(6_000);
    expect(row().refresh_token_enc).toBe("enc:r2");
    expect(await call).toBe("ok");
  });

  test("a user with no token row isn't connected, and is never handed anyone else's", async () => {
    await expect(fleetGet<string>(OTHER, "/api/1/vehicles")).rejects.toBeInstanceOf(NotConnectedError);
    expect(tokensOf(2)).toEqual([]);
    expect(tesla.requests).toBe(0);
  });
});

describe("Fleet API requests", () => {
  beforeEach(() => {
    const first = tesla.issue();
    fake = new FakeDb({
      users: users(),
      user_tokens: [{ user_id: 1, access_token_enc: `enc:${first.access_token}`, refresh_token_enc: `enc:${first.refresh_token}`, expires_at: new Date(Date.now() + 3_600_000).toISOString(), refreshing_until: null }],
    });
    jest.useFakeTimers();
  });
  const counted = () => fake.rpcs.filter((r) => r.fn === "increment_api_usage" && r.args.p_user_id === 1).length;

  test("an invoice that takes longer than the timeout to download still arrives whole", async () => {
    const answer = fleetGetRaw(OWNER, "/api/1/dx/charging/invoice/slow-body");
    await elapse(1_000);
    const body = (await answer).text().catch((err: Error) => err);
    await elapse(15_000);
    expect(await body).toBe(JSON.stringify({ response: "ok" }));
  });

  test("a JSON answer whose body stalls past the timeout is given up on", async () => {
    const call = fleetGet<string>(OWNER, "/api/1/slow-body").catch((err: Error) => err);
    await elapse(12_000);
    expect(await call).toMatchObject({ name: "TimeoutError" });
  });

  test("a request given up on still counts against the Tesla budget", async () => {
    const call = fleetGet<string>(OWNER, "/api/1/slow-answer").catch((err: Error) => err);
    await elapse(12_000);
    expect(await call).toMatchObject({ name: "TimeoutError" });
    expect(counted()).toBe(1);
  });
});

describe("sign-in with sign-up closed", () => {
  beforeEach(() => {
    fake = new FakeDb({ users: users(), user_tokens: [] });
  });

  test("an approved user signs in and their tokens are stored as theirs", async () => {
    expect(await signIn("other")).toMatchObject({ userId: 2 });
    expect(fake.rows("user_tokens")).toEqual([expect.objectContaining({ user_id: 2, access_token_enc: "enc:a1", refresh_token_enc: "enc:r1" })]);
  });

  test("an unknown Tesla account is refused and nothing of it is stored", async () => {
    expect(await signIn("stranger")).toBe("not-owner");
    expect(fake.rows("users")).toHaveLength(4);
    expect(fake.rows("user_tokens")).toEqual([]);
    expect(regionAsked).toBe(0);
  });

  test("a waitlisted account is told it's waiting; declined and suspended ones are not approved; none stores tokens", async () => {
    fake.rows("users")[1].status = "suspended";
    expect(await signIn("waiting")).toBe("waitlist");
    expect(await signIn("declined")).toBe("not-approved");
    expect(await signIn("other")).toBe("not-approved");
    expect(fake.rows("user_tokens")).toEqual([]);
  });
});

describe("sign-in with SIGNUP_MODE=waitlist", () => {
  beforeEach(() => {
    process.env.SIGNUP_MODE = "waitlist";
    region = FLEET_NA_APAC;
    regionAsked = 0;
    fake = new FakeDb({ users: users(), user_tokens: [] });
  });
  afterEach(() => {
    delete process.env.SIGNUP_MODE;
  });

  const row = (sub: string) => fake.rows("users").find((r) => r.tesla_sub === sub);

  test("an unknown account joins the waitlist with its Tesla id and nothing else, and stores no tokens", async () => {
    expect(await signIn("newcomer")).toBe("waitlist");
    expect(Object.keys(row("newcomer")!).sort()).toEqual(["status", "tesla_sub"]);
    expect(row("newcomer")!.status).toBe("waitlist");
    expect(fake.rows("user_tokens")).toEqual([]);
    expect(regionAsked).toBe(1);
  });

  test("signing in again keeps its place and still stores nothing", async () => {
    expect(await signIn("waiting")).toBe("waitlist");
    expect(fake.rows("users").filter((r) => r.tesla_sub === "waiting")).toEqual([expect.objectContaining({ id: 3, created_at: "2026-10-03T00:00:00Z" })]);
    expect(regionAsked).toBe(0); // only a new request is region-checked
    expect(fake.rows("user_tokens")).toEqual([]);
  });

  test("an account outside the APAC Fleet API region is refused and not stored", async () => {
    region = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
    expect(await signIn("newcomer")).toBe("region");
    expect(row("newcomer")).toBeUndefined();
    expect(fake.rows("user_tokens")).toEqual([]);
  });

  test("no answer from Tesla's region check fails the sign-in rather than letting it join", async () => {
    region = null;
    await expect(signIn("newcomer")).rejects.toThrow();
    expect(row("newcomer")).toBeUndefined();
  });

  test("a declined account is still refused, and an approved one still signs in", async () => {
    expect(await signIn("declined")).toBe("not-approved");
    expect(row("declined")!.status).toBe("declined");
    expect(await signIn("other")).toMatchObject({ userId: 2 });
    expect(fake.rows("user_tokens")).toEqual([expect.objectContaining({ user_id: 2 })]);
  });
});
