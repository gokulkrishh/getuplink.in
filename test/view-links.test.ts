import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { FakeDb } from "./fake-db";

// View links end to end against a fake database: making them (the cap), opening /v/<token>, the viewer
// cookie, currentReader() and its re-reads, /v/status, the proxy, and the guards that keep a viewer
// read-only. Made-up accounts only: user 1 owns the car, user 2 is another owner, user 3 is suspended.

let fake: FakeDb;
const jar = new Map<string, string>();
let fetches: string[] = [];

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => new Headers({ host: "app.getuplink.in" }),
}));
// redirect() and notFound() as Next throws them: an error whose digest names where to.
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
const realServer = await import("next/server");
mock.module("next/server", () => ({ ...realServer, connection: async () => {} }));
// updateTag runs only inside a real Server Action; the actions here are called directly.
const realCache = await import("next/cache");
mock.module("next/cache", () => ({ ...realCache, updateTag: () => {} }));

process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI"]) process.env[name] ??= "test";
globalThis.fetch = (async (input: string | URL | Request) => {
  fetches.push(String(input));
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const { asOwner, asViewer, hides, ownerDb, ViewOnlyWrite } = await import("@/lib/server/data/owner");
const views = await import("@/lib/server/view-links");
const { currentOwner, currentReader, isViewerRequest, ownerOnlyExit, requireReader } = await import("@/lib/server/auth");
const { createViewCookie, viewCookieLink, VIEW_COOKIE } = await import("@/lib/view-cookie");
const { createSession, isValidSession, SESSION_COOKIE } = await import("@/lib/session");
const { VIEW_LINK_LIMIT, openedLine, isUsedLink, isViewToken, SHARES_EVERYTHING: ALL, viewBarOpen, GUEST_SCRIPT, LINK_ENDED_TITLE, LINK_ENDED_BODY } = await import("@/lib/view-links");
const { GUEST_HINT_COOKIE, VIEW_PENDING_COOKIE } = await import("@/lib/view-cookie");
const { revokeAllSessions } = await import("@/lib/server/tesla");
const { GET: openLink, POST: proceed } = await import("@/app/v/[token]/route");
const { POST: seen } = await import("@/app/v/seen/route");
const { GET: linkStatus } = await import("@/app/v/status/route");
const { GET: leave } = await import("@/app/v/leave/route");
const { proxy } = await import("@/proxy");
const { GET: receiptFile } = await import("@/app/api/charging/receipt/[id]/route");
const { GET: teslaInvoice } = await import("@/app/api/charging/invoice/[id]/route");

const OWNER = asOwner(1, "made-up-owner");
const OTHER = asOwner(2, "made-up-other");
const MIN = 60_000;

const user = (id: number, sub: string, status = "approved") => ({
  id,
  tesla_sub: sub,
  status,
  role: "user",
  sessions_valid_after: "-infinity",
  signed_out_sessions: [],
  created_at: "2026-10-01T00:00:00Z",
});

beforeEach(() => {
  jar.clear();
  fetches = [];
  fake = new FakeDb({
    users: [user(1, "made-up-owner"), user(2, "made-up-other"), user(3, "made-up-suspended", "suspended")],
    car_view_links: [],
    vehicles: [{ id: 11, user_id: 1, vin: "TESTVIN0000000OWNER", display_name: "Made-up Car", created_at: "2026-10-01T00:00:00Z" }],
  });
  fake.autoIds.add("car_view_links");
});

async function make(owner = OWNER, label = "Dad", length = "30m", hides: unknown = ALL): Promise<string> {
  const made = await views.makeViewLink(owner, label, length, Date.now(), hides);
  if (!("token" in made)) throw new Error(`refused: ${made.refused}`);
  return made.token;
}

const link = (id = 1) => fake.rows("car_view_links").find((r) => r.id === id)!;
// Sends the jar's cookies, as a browser would (the route reads the session from the request's own Cookie
// header, and the viewer cookie through cookies(), which reads the jar).
const open = (token: string, host = "app.getuplink.in") =>
  openLink(new Request(`https://${host}/v/${token}`, { headers: { host, ...(jar.size ? { cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") } : {}) } }), {
    params: Promise.resolve({ token }),
  });

// Keeps the cookies a response sets, as a browser would (an expired one goes).
function keep(res: Response): void {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const name = pair.slice(0, pair.indexOf("="));
    if (c.includes("Max-Age=0")) jar.delete(name);
    else jar.set(name, pair.slice(name.length + 1));
  }
}

// /v/open's script, in a browser: it posts to /v/seen from the app's own origin to claim the link.
const claim = (origin = "https://app.getuplink.in") =>
  seen(new Request("https://app.getuplink.in/v/seen", { method: "POST", headers: { host: "app.getuplink.in", ...(origin ? { origin } : {}) } }));
const opened = async (res: Response) => ((await res.json()) as { opened: boolean }).opened;

// Opens the link in a browser, as a person would: /v/<token>, then /v/open's claim, keeping the cookies.
async function visit(token: string): Promise<void> {
  keep(await open(token));
  keep(await claim());
  if (!jar.has(VIEW_COOKIE)) throw new Error("no viewer cookie");
}

describe("the link's token", () => {
  test("is 32 bytes rebuilt from the link's id and created_at; only its sha256 is stored, and only the exact token opens the link", async () => {
    const token = await make();
    expect(isViewToken(token)).toBe(true);
    // Rebuilt, it's the very token that opens the link; another id or time gives another.
    expect(views.viewLinkToken(1, (link().created_at as string))).toBe(token);
    expect(await views.viewLinkTokenAgain(OWNER, 1, Date.now())).toBe(token);
    expect(views.viewLinkToken(2, (link().created_at as string))).not.toBe(token);
    expect(views.viewLinkToken(1, new Date(Date.parse((link().created_at as string)) + 1).toISOString())).not.toBe(token);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(link().token_hash).toBe(views.viewTokenHash(token));
    expect(link().token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.tables)).not.toContain(token);
    expect(await views.openViewLink(token, Date.now())).not.toBeNull();
    const wrong = (token[0] === "A" ? "B" : "A") + token.slice(1);
    expect(await views.openViewLink(wrong, Date.now())).toBeNull();
    expect(await views.openViewLink("not-a-token", Date.now())).toBeNull();
    expect(await views.openViewLink(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), Date.now())).toBeNull();
  });

  test("Copy link rebuilds only the owner's own open links, and never for a guest", async () => {
    const token = await make();
    expect(await views.viewLinkTokenAgain(OWNER, 1, Date.now())).toBe(token);
    expect(await views.viewLinkTokenAgain(OTHER, 1, Date.now())).toBeNull();
    await expect(views.viewLinkTokenAgain(asViewer(1, "made-up-owner"), 1, Date.now())).rejects.toThrow();
    link().expires_at = new Date(Date.now() - 1).toISOString();
    expect(await views.viewLinkTokenAgain(OWNER, 1, Date.now())).toBeNull();
    link().expires_at = new Date(Date.now() + MIN).toISOString();
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await views.viewLinkTokenAgain(OWNER, 1, Date.now())).toBeNull();
    // A link made under the old random-token scheme can't be rebuilt: Copy gives nothing.
    await make(OWNER, "Old");
    link(2).token_hash = "0".repeat(64);
    expect(await views.viewLinkTokenAgain(OWNER, 2, Date.now())).toBeNull();
  });

  test("Copy link's action refuses anyone but the owner, and another owner's link", async () => {
    const { copyViewLinkAction } = await import("@/app/settings/actions");
    const token = await make();
    // No session: sent to sign in. A guest has none either.
    expect(await copyViewLinkAction(1).catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
    await visit(token);
    expect(await copyViewLinkAction(1).catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
    jar.clear();
    jar.set(SESSION_COOKIE, await createSession(2));
    expect(await copyViewLinkAction(1)).toEqual({ error: expect.any(String) });
    jar.set(SESSION_COOKIE, await createSession(1));
    expect(await copyViewLinkAction(1)).toEqual({ token });
  });

  test("any signed-in owner makes guest links from Settings, not only the admin; a guest never can", async () => {
    const { makeViewLinkAction } = await import("@/app/settings/actions");
    // No session: sent to sign in.
    expect(await makeViewLinkAction("Dad", "30m", true, ALL).catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
    // A guest, on another owner's link, has a viewer cookie and no session: sent to sign in too.
    await visit(await make());
    expect(await makeViewLinkAction("Dad", "30m", true, ALL).catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
    jar.clear();
    // User 2 is an owner with role "user": the link is theirs.
    jar.set(SESSION_COOKIE, await createSession(2));
    expect(await makeViewLinkAction("Mum", "30m", false, ALL)).toEqual({ error: "Tick the box to confirm you trust this person." });
    expect(await makeViewLinkAction("Mum", "30m", true, ALL)).toEqual({ label: "Mum", token: expect.any(String) });
    expect(fake.rows("car_view_links").filter((r) => r.user_id === 2).map((r) => r.label)).toEqual(["Mum"]);
  });

  test("lasts 30 minutes, 1 hour or 1 day, and nothing else", async () => {
    const now = Date.now();
    for (const [length, ms] of [["30m", 30 * MIN], ["1h", 60 * MIN], ["1d", 24 * 60 * MIN]] as const) {
      const made = await views.makeViewLink(OWNER, "Dad", length, now, ALL);
      if (!("link" in made)) throw new Error("refused");
      expect(Date.parse(made.link.expiresAt) - now).toBe(ms);
      // Ended again so the next length isn't refused by the open-link limit.
      await views.endViewLink(OWNER, made.link.id, now);
    }
    expect(await views.makeViewLink(OWNER, "Dad", "2d", now, ALL)).toEqual({ refused: "length" });
    expect(await views.makeViewLink(OWNER, "  ", "30m", now, ALL)).toEqual({ refused: "label" });
    expect(await views.makeViewLink(OWNER, "x".repeat(41), "30m", now, ALL)).toEqual({ refused: "label" });
  });

  test(`an owner may have ${VIEW_LINK_LIMIT} open links; an ended or expired one frees a place`, async () => {
    for (let k = 0; k < VIEW_LINK_LIMIT; k++) await make();
    expect(await views.makeViewLink(OWNER, "Sixth", "30m", Date.now(), ALL)).toEqual({ refused: "limit" });
    // Another owner's links are counted on their own.
    await make(OTHER);
    expect(await views.endViewLink(OWNER, 1, Date.now())).toBe(true);
    await make();
    link(2).expires_at = new Date(Date.now() - 1000).toISOString();
    await make();
    expect(await views.makeViewLink(OWNER, "Eighth", "30m", Date.now(), ALL)).toEqual({ refused: "limit" });
  });

  test("keeps Hide locations as chosen, refuses anything but true or false, and never writes hide_costs", async () => {
    await make(OWNER, "Dad", "30m", { hideLocations: true });
    await make(OWNER, "Mum", "30m", { hideLocations: false });
    expect([link(1).hide_locations, link(2).hide_locations]).toEqual([true, false]);
    // The hide_costs column is left alone: costs are always shared.
    expect(fake.rows("car_view_links").every((r) => !("hide_costs" in r))).toBe(true);
    expect((await views.loadViewLinks(OWNER, Date.now())).links.map((l) => [l.label, l.hideLocations])).toEqual([
      ["Mum", false],
      ["Dad", true],
    ]);
    for (const bad of [undefined, null, {}, { hideLocations: "yes" }]) {
      expect(await views.makeViewLink(OWNER, "Dad", "30m", Date.now(), bad)).toEqual({ refused: "hides" });
    }
    expect(fake.rows("car_view_links")).toHaveLength(2);
  });

  test("the owner can turn Hide locations on and off while a link is open; never another owner's, nor an ended one", async () => {
    await make(OWNER);
    expect(await views.setViewLinkHideLocations(OWNER, 1, true, Date.now())).toBe(true);
    expect(link(1).hide_locations).toBe(true);
    expect(await views.setViewLinkHideLocations(OTHER, 1, false, Date.now())).toBe(false);
    expect(link(1).hide_locations).toBe(true);
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await views.setViewLinkHideLocations(OWNER, 1, false, Date.now())).toBe(false);
    expect(link(1).hide_locations).toBe(true);
    await expect(views.setViewLinkHideLocations(asViewer(1, "made-up-owner"), 1, false, Date.now())).rejects.toThrow();
  });

  test("before the migration, making one says view links aren't set up", async () => {
    fake.missing.add("car_view_links");
    expect(await views.makeViewLink(OWNER, "Dad", "30m", Date.now(), ALL)).toEqual({ refused: "unavailable" });
    expect(await views.loadViewLinks(OWNER, Date.now())).toEqual({ available: false, links: [] });
  });

  test("an owner ends only their own links", async () => {
    await make();
    expect(await views.endViewLink(OTHER, 1, Date.now())).toBe(false);
    expect(link().revoked_at ?? null).toBeNull();
  });
});

describe("the viewer cookie", () => {
  test("names its link, signed; a changed id, a past end or another key fails", async () => {
    const end = Date.now() + 30 * MIN;
    const cookie = await createViewCookie(7, end);
    expect(await viewCookieLink(cookie)).toBe(7);
    const [, ...rest] = cookie.split(".");
    expect(await viewCookieLink(["8", ...rest].join("."))).toBeNull();
    expect(await viewCookieLink(cookie, end + 1000)).toBeNull();
    expect(await viewCookieLink(await createViewCookie(7, Date.now() - 1000))).toBeNull();
    expect(await viewCookieLink(undefined)).toBeNull();
  });

  test("a viewer cookie is never a session, nor a session a viewer cookie", async () => {
    const view = await createViewCookie(1, Date.now() + 30 * MIN);
    const session = await createSession(1);
    expect(await isValidSession(view)).toBe(false);
    expect(await viewCookieLink(session)).toBeNull();
  });

  test("currentOwner() never accepts it, even in the session cookie's place", async () => {
    const token = await make();
    await visit(token);
    expect(await currentOwner()).toBeNull();
    jar.set(SESSION_COOKIE, jar.get(VIEW_COOKIE)!);
    expect(await currentOwner()).toBeNull();
  });
});

describe("currentReader()", () => {
  test("the owner's own session reads as the owner, with no viewer", async () => {
    jar.set(SESSION_COOKIE, await createSession(1));
    const reader = await currentReader();
    expect(reader?.viewer).toBeNull();
    expect(reader?.owner).toEqual(OWNER);
    expect(reader?.owner.viewOnly).toBeUndefined();
  });

  test("a viewer reads the link's owner, view-only, with the link", async () => {
    await visit(await make());
    const reader = await currentReader();
    expect(reader?.owner).toEqual(asViewer(1, "made-up-owner"));
    expect(reader?.owner.viewOnly).toBe(true);
    // Claimed by this browser: used, once.
    expect(reader?.viewer).toEqual(expect.objectContaining({ id: 1, label: "Dad", viewCount: 1, lastViewedAt: expect.any(String) }));
    expect(JSON.stringify(reader)).not.toContain("token_hash");
  });

  test("a viewer's Owner carries Hide locations, read again on every request; the owner's own never does", async () => {
    await visit(await make(OWNER, "Dad", "30m", { hideLocations: true }));
    const reader = await currentReader();
    expect(reader?.owner).toEqual(asViewer(1, "made-up-owner", ["locations"]));
    expect(hides(reader!.owner, "locations")).toBe(true);
    expect(hides(OWNER, "locations")).toBe(false);
    // The owner turns it off: the guest's next request reads it so.
    await views.setViewLinkHideLocations(OWNER, 1, false, Date.now());
    expect(hides((await currentReader())!.owner, "locations")).toBe(false);
  });

  test("re-reads the link on every request: ended, expired or gone stops it at once", async () => {
    await visit(await make());
    expect(await currentReader()).not.toBeNull();
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await currentReader()).toBeNull();

    link().revoked_at = null;
    link().expires_at = new Date(Date.now() - 1).toISOString();
    expect(await currentReader()).toBeNull();

    link().expires_at = new Date(Date.now() + MIN).toISOString();
    expect(await currentReader()).not.toBeNull();
    fake.tables.car_view_links = [];
    expect(await currentReader()).toBeNull();
  });

  test("stops when the owner is no longer approved, or signs out everywhere", async () => {
    await visit(await make());
    fake.rows("users")[0].status = "suspended";
    expect(await currentReader()).toBeNull();
    fake.rows("users")[0].status = "approved";
    expect(await currentReader()).not.toBeNull();
    await revokeAllSessions(OWNER);
    expect(await currentReader()).toBeNull();
    expect(link().revoked_at).toEqual(expect.any(String));
  });

  test("a link made before Sign out everywhere stops even if its row wasn't marked", async () => {
    await visit(await make());
    fake.rows("users")[0].sessions_valid_after = new Date(Date.now() + 1000).toISOString();
    expect(await currentReader()).toBeNull();
  });

  test("before the migration there is no viewer", async () => {
    await visit(await make());
    fake.missing.add("car_view_links");
    expect(await currentReader()).toBeNull();
  });

  test("a page with an ended viewer cookie goes to the ended page, without one to sign in", async () => {
    await visit(await make());
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await requireReader().catch((e: { digest?: string }) => e.digest)).toContain("/v/ended");
    jar.clear();
    expect(await requireReader().catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
  });

  test("owner-only pages (Settings, setup, admin) are not found for a viewer; an ended guest goes to the ended page", async () => {
    await visit(await make());
    expect(await isViewerRequest()).toBe(true);
    expect(await ownerOnlyExit().catch((e: { digest?: string }) => e.digest)).toContain("404");
    // Ended: the signature still holds, but the link doesn't.
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await isViewerRequest()).toBe(false);
    expect(await ownerOnlyExit().catch((e: { digest?: string }) => e.digest)).toContain("/v/ended");
    jar.clear();
    expect(await isViewerRequest()).toBe(false);
    expect(await ownerOnlyExit().catch((e: { digest?: string }) => e.digest)).toContain("/api/auth/signed-out");
  });

  test("a view-only owner can't write: every write throws before reaching the database", async () => {
    const viewer = asViewer(1, "made-up-owner");
    expect(() => ownerDb(viewer).from("user_places").insert({ name: "x" })).toThrow(ViewOnlyWrite);
    expect(() => ownerDb(viewer).from("user_places").update({ name: "x" })).toThrow(ViewOnlyWrite);
    expect(() => ownerDb(viewer).from("user_places").upsert({ name: "x" })).toThrow(ViewOnlyWrite);
    expect(() => ownerDb(viewer).from("user_places").delete()).toThrow(ViewOnlyWrite);
    expect(fake.calls.filter((c) => c.table === "user_places")).toEqual([]);
    // Reads work as the owner's.
    expect((await ownerDb(viewer).from("vehicles").select("vin")).data).toHaveLength(1);
    await expect(views.makeViewLink(viewer, "Dad", "30m", Date.now(), ALL)).rejects.toThrow();
  });
});

describe("/v/<token>", () => {
  test("an open link sets only the signed pending cookie and goes to /v/open, using nothing up", async () => {
    const token = await make();
    const res = await open(token);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/v/open");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const cookies = res.headers.getSetCookie();
    // No viewer cookie and no hint yet: only the browser that claims the link gets them.
    expect(cookies.some((c) => c.startsWith(`${VIEW_COOKIE}=`) || c.startsWith(`${GUEST_HINT_COOKIE}=`))).toBe(false);
    const pending = cookies.find((c) => c.startsWith(`${VIEW_PENDING_COOKIE}=`))!;
    expect(pending).toMatch(/^tiu_view_new=1\.\d+\.[0-9a-f]{64}; Path=\/v\/seen;.*HttpOnly/);
    expect(pending).not.toContain("Domain=");
    const maxAge = Number(/Max-Age=(\d+)/.exec(pending)![1]);
    expect(maxAge).toBeGreaterThan(29 * 60);
    expect(maxAge).toBeLessThanOrEqual(30 * 60);
    expect(link().view_count ?? 0).toBe(0);
    expect(link().last_viewed_at ?? null).toBeNull();
  });

  test("a link preview (a fetch that runs no script, so never claims) doesn't use the link up", async () => {
    const token = await make();
    await open(token);
    await open(token);
    expect(link().last_viewed_at ?? null).toBeNull();
    // A real browser still gets in afterwards.
    await visit(token);
    expect((await currentReader())?.viewer?.id).toBe(1);
  });

  test("the claim gives the viewer cookie and its hint until the link's end, and marks the link used", async () => {
    const token = await make();
    keep(await open(token));
    // A post from another site is refused, and leaves the pending cookie.
    const foreign = await claim("https://elsewhere.example");
    expect(foreign.status).toBe(403);
    expect(foreign.headers.getSetCookie()).toEqual([]);
    expect(link().last_viewed_at ?? null).toBeNull();
    const res = await claim();
    expect(await opened(res)).toBe(true);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const cookies = res.headers.getSetCookie();
    expect(cookies).toContainEqual(expect.stringMatching(/^tiu_view_new=; Path=\/v\/seen; Max-Age=0/));
    const view = cookies.find((c) => c.startsWith(`${VIEW_COOKIE}=`) && !c.includes("Max-Age=0"))!;
    expect(view).toContain("HttpOnly");
    expect(view).toContain("SameSite=Lax");
    expect(view).toContain("Path=/");
    expect(view).not.toContain("Domain=");
    const maxAge = Number(/Max-Age=(\d+)/.exec(view)![1]);
    expect(maxAge).toBeGreaterThan(29 * 60);
    expect(maxAge).toBeLessThanOrEqual(30 * 60);
    const hint = cookies.find((c) => c.startsWith(`${GUEST_HINT_COOKIE}=`))!;
    expect(hint).not.toContain("HttpOnly");
    expect(hint.split(";")[0]).toBe(`${GUEST_HINT_COOKIE}=${Math.floor(Date.parse(link().expires_at as string) / 1000)}`);
    expect(link().view_count).toBe(1);
    expect(link().last_viewed_at).toEqual(expect.any(String));
  });

  test("the browser that claimed it keeps access: pages, reloads and opening the link again", async () => {
    const token = await make();
    await visit(token);
    const usedAt = link().last_viewed_at;
    expect((await currentReader())?.viewer?.id).toBe(1);
    // The link again, in the same browser: straight Home, cookies untouched.
    const again = await open(token);
    expect(new URL(again.headers.get("location")!).pathname).toBe("/");
    expect(again.headers.getSetCookie()).toEqual([]);
    // A reload of /v/open answers opened, and changes nothing.
    const reclaim = await claim();
    expect(await opened(reclaim)).toBe(true);
    expect(reclaim.headers.getSetCookie()).toEqual([]);
    expect((await currentReader())?.viewer?.id).toBe(1);
    expect(link().view_count).toBe(1);
    expect(link().last_viewed_at).toBe(usedAt);
  });

  test("any other browser opening a used link gets the ended page, with no cookie", async () => {
    const token = await make();
    await visit(token);
    // Another browser, or a private window: no cookies.
    jar.clear();
    const res = await open(token);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/v/ended");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await currentReader()).toBeNull();
    // Even one holding a viewer cookie for another link of the owner's.
    await visit(await make(OWNER, "Mum"));
    expect(new URL((await open(token)).headers.get("location")!).pathname).toBe("/v/ended");
  });

  test("two browsers racing: exactly one claim wins, the other gets the ended page", async () => {
    const token = await make();
    // Both open the link before either claims it.
    keep(await open(token));
    const a = new Map(jar);
    jar.clear();
    keep(await open(token));
    // B claims first and wins.
    const won = await claim();
    expect(await opened(won)).toBe(true);
    keep(won);
    const b = new Map(jar);
    // A's claim loses: its pending cookie goes, and it never gets a viewer cookie.
    jar.clear();
    for (const [k, v] of a) jar.set(k, v);
    const lost = await claim();
    expect(await opened(lost)).toBe(false);
    expect(lost.headers.getSetCookie()).toEqual([expect.stringMatching(/^tiu_view_new=; Path=\/v\/seen; Max-Age=0/)]);
    keep(lost);
    expect(jar.has(VIEW_COOKIE)).toBe(false);
    expect(await currentReader()).toBeNull();
    expect(link().view_count).toBe(1);
    // B still reads.
    jar.clear();
    for (const [k, v] of b) jar.set(k, v);
    expect((await currentReader())?.viewer?.id).toBe(1);
  });

  test("the claim is one conditional update: a second claim of the same row matches nothing", async () => {
    await make();
    const now = Date.now();
    expect(await views.claimViewLink(1, now)).not.toBeNull();
    expect(await views.claimViewLink(1, now + 1)).toBeNull();
  });

  test("a forged pending cookie, or one for an ended link, claims nothing", async () => {
    const token = await make();
    jar.set(VIEW_PENDING_COOKIE, "1");
    expect(await opened(await claim())).toBe(false);
    jar.set(VIEW_PENDING_COOKIE, await createViewCookie(1, Date.now() + 30 * MIN));
    expect(await opened(await claim())).toBe(false);
    expect(link().last_viewed_at ?? null).toBeNull();
    jar.clear();
    keep(await open(token));
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await opened(await claim())).toBe(false);
    expect(link().last_viewed_at ?? null).toBeNull();
  });

  test("with an owner's session, it asks first: no cookie changes until a same-origin POST", async () => {
    const token = await make();
    jar.set(SESSION_COOKIE, await createSession(1));
    const asked = await open(token);
    expect(asked.status).toBe(303);
    expect(new URL(asked.headers.get("location")!).pathname).toBe(`/v/${token}/confirm`);
    expect(asked.headers.getSetCookie()).toEqual([]);
    const post = (origin?: string) =>
      proceed(new Request(`https://app.getuplink.in/v/${token}`, { method: "POST", headers: { host: "app.getuplink.in", ...(origin ? { origin } : {}) } }), { params: Promise.resolve({ token }) });
    // From another site, or with no Origin: refused, nothing set.
    for (const origin of ["https://elsewhere.example", "null", undefined]) {
      const res = await post(origin);
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    // From the confirm page: the pending cookie, and both owner session cookies expire.
    const res = await post("https://app.getuplink.in");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/v/open");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${VIEW_PENDING_COOKIE}=`) && !c.includes("Max-Age=0"))).toBe(true);
    const sessions = cookies.filter((c) => c.startsWith(`${SESSION_COOKIE}=;`));
    expect(sessions).toHaveLength(2);
    expect(sessions.every((c) => c.includes("Max-Age=0"))).toBe(true);
    expect(sessions.filter((c) => c.includes("Domain=getuplink.in"))).toHaveLength(1);
    // An ended link with an owner's session goes to the ended page, without asking.
    await views.endViewLink(OWNER, 1, Date.now());
    expect(new URL((await open(token)).headers.get("location")!).pathname).toBe("/v/ended");
    expect(new URL((await post("https://app.getuplink.in")).headers.get("location")!).pathname).toBe("/v/ended");
  });

  for (const [what, setUp] of [
    ["expired", async () => {
      const token = await make();
      link().expires_at = new Date(Date.now() - 1).toISOString();
      return token;
    }],
    ["ended", async () => {
      const token = await make();
      await views.endViewLink(OWNER, 1, Date.now());
      return token;
    }],
    ["unknown", async () => (await make(), "A".repeat(43))],
    ["malformed", async () => "not-a-token"],
    ["before the migration", async () => {
      const token = "B".repeat(43);
      fake.missing.add("car_view_links");
      return token;
    }],
  ] as const) {
    test(`an ${what} link goes to the ended page, sets no cookie and counts nothing`, async () => {
      const token = await setUp();
      const res = await open(token);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/v/ended");
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(fake.rows("car_view_links").every((r) => !r.view_count)).toBe(true);
    });
  }

  test("a used link signs no owner out: the ended page, without asking", async () => {
    const token = await make();
    await visit(token);
    jar.clear();
    jar.set(SESSION_COOKIE, await createSession(1));
    const res = await open(token);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/v/ended");
    expect(res.headers.getSetCookie()).toEqual([]);
    const post = await proceed(new Request(`https://app.getuplink.in/v/${token}`, { method: "POST", headers: { host: "app.getuplink.in", origin: "https://app.getuplink.in" } }), {
      params: Promise.resolve({ token }),
    });
    expect(new URL(post.headers.get("location")!).pathname).toBe("/v/ended");
    expect(post.headers.getSetCookie()).toEqual([]);
  });

  test("an open link whose owner is suspended still ends at the first page", async () => {
    const token = await make(asOwner(3, "made-up-suspended"));
    await visit(token);
    expect(await currentReader()).toBeNull();
  });
});

describe("/v/status", () => {
  const status = async () => (await (await linkStatus()).json()) as { open: boolean; hideLocations?: boolean };

  test("open while the link is, closed once ended or expired, and closed with no cookie", async () => {
    expect(await status()).toEqual({ open: false });
    await visit(await make());
    expect(await status()).toEqual({ open: true, hideLocations: false });
    link().expires_at = new Date(Date.now() - 1).toISOString();
    expect(await status()).toEqual({ open: false });
    link().expires_at = new Date(Date.now() + MIN).toISOString();
    expect(await status()).toEqual({ open: true, hideLocations: false });
    await views.endViewLink(OWNER, 1, Date.now());
    expect(await status()).toEqual({ open: false });
  });

  test("an owner's own session isn't a viewer's", async () => {
    jar.set(SESSION_COOKIE, await createSession(1));
    expect(await status()).toEqual({ open: false });
  });

  test("is never kept, and asks nothing outside Uplink", async () => {
    await visit(await make());
    const res = await linkStatus();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fetches).toEqual([]);
  });

  test("says whether the link hides locations, so an open page notices the owner changing it", async () => {
    await visit(await make(OWNER, "Dad", "30m", { hideLocations: false }));
    expect(await (await linkStatus()).json()).toEqual({ open: true, hideLocations: false });
    await views.setViewLinkHideLocations(OWNER, 1, true, Date.now());
    expect(await (await linkStatus()).json()).toEqual({ open: true, hideLocations: true });
  });

  test("Exit drops the viewer cookie, its hint and the not-counted cookie, and goes home", async () => {
    const res = await leave(new Request("https://app.getuplink.in/v/leave"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/home");
    expect(res.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^tiu_view=; Path=\/; Max-Age=0; HttpOnly/),
      expect.stringMatching(/^tiu_guest=; Path=\/; Max-Age=0/),
      expect.stringMatching(/^tiu_view_new=; Path=\/v\/seen; Max-Age=0/),
    ]);
  });
});

describe("the proxy", () => {
  const visitAs = (path: string, cookie?: string) =>
    proxy(new NextRequest(`https://app.getuplink.in${path}`, { headers: { host: "app.getuplink.in", ...(cookie ? { cookie } : {}) } }));

  test("lets a signed viewer cookie open pages, never any /api route (invoice downloads included)", async () => {
    const cookie = `${VIEW_COOKIE}=${await createViewCookie(1, Date.now() + 30 * MIN)}`;
    const page = await visitAs("/stats/driving", cookie);
    expect(page.headers.get("location")).toBeNull();
    expect(page.headers.get("cache-control")).toContain("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const call = (path: string, method: string, sent = cookie) =>
      proxy(new NextRequest(`https://app.getuplink.in${path}`, { method, headers: { host: "app.getuplink.in", ...(sent ? { cookie: sent } : {}) } }));
    // Every API route there is, each with a made-up id in its [segment]s.
    const routes = files("app/api")
      .filter((f) => /route\.ts$/.test(f))
      .map((f) => "/" + relative("app", f).split("\\").join("/").replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "1"));
    expect(routes).toContain("/api/charging/invoice/1");
    expect(routes).toContain("/api/charging/receipt/1");
    // What the viewer cookie opens beyond a request with none (public routes such as sign-in and the crons
    // check their own secrets either way): nothing.
    const opened: string[] = [];
    for (const path of routes)
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const [withCookie, without] = await Promise.all([call(path, method), call(path, method, "")]);
        if (withCookie.status !== without.status) opened.push(`${method} ${path}`);
      }
    expect(opened).toEqual([]);
    // A forged or expired one is turned away like no cookie.
    expect(new URL((await visitAs("/stats/driving", `${VIEW_COOKIE}=1.9999999999.abc`)).headers.get("location")!).pathname).toBe("/home");
    const expired = `${VIEW_COOKIE}=${await createViewCookie(1, Date.now() - 1000)}`;
    expect(new URL((await visitAs("/", expired)).headers.get("location")!).pathname).toBe("/home");
  });

  test("the /v paths are open to anyone, and the ended page answers 410 and drops every guest cookie", async () => {
    for (const path of ["/v/abc", "/v/abc/confirm", "/v/open", "/v/status", "/v/seen", "/v/leave"]) expect((await visitAs(path)).headers.get("location")).toBeNull();
    const ended = await visitAs("/v/ended");
    expect(ended.headers.get("location")).toBeNull();
    expect(ended.status).toBe(410);
    expect(ended.headers.get("x-robots-tag")).toContain("noindex");
    expect(ended.headers.getSetCookie()).toEqual([expect.stringMatching(/^tiu_view=; Path=\/; Max-Age=0/), expect.stringMatching(/^tiu_view_new=; Path=\/v\/seen; Max-Age=0/)]);
    expect((await visitAs("/v/ended", `${GUEST_HINT_COOKIE}=1`)).headers.getSetCookie()).toContainEqual(expect.stringMatching(/^tiu_guest=; Path=\/; Max-Age=0/));
  });

  test("a guest's pages carry the hint for the first script; anyone else's drop it", async () => {
    const end = Date.now() + 30 * MIN;
    const guest = `${VIEW_COOKIE}=${await createViewCookie(1, end)}`;
    const hint = `${GUEST_HINT_COOKIE}=${Math.floor(end / 1000)}`;
    const page = await visitAs("/stats/driving", guest);
    expect(page.headers.getSetCookie()).toEqual([expect.stringMatching(new RegExp(`^${hint}; Path=/; Max-Age=\\d+; SameSite=Lax$`))]);
    // Already there: not set again.
    expect((await visitAs("/car", `${guest}; ${hint}`)).headers.getSetCookie()).toEqual([]);
    // An owner's page, or a signed-out one, that still carries it drops it, so it never makes room for a band.
    const owner = `${SESSION_COOKIE}=${await createSession(1)}`;
    expect((await visitAs("/", `${owner}; ${hint}`)).headers.getSetCookie()).toEqual([expect.stringMatching(/^tiu_guest=; Path=\/; Max-Age=0/)]);
    expect((await visitAs("/", owner)).headers.getSetCookie()).toEqual([]);
    expect((await visitAs("/", hint)).headers.getSetCookie()).toEqual([expect.stringMatching(/^tiu_guest=; Path=\/; Max-Age=0/)]);
  });
});

describe("redirects stay on the host the browser used", () => {
  // In dev the server's own URL is http://localhost:3000 while the browser is on app.getuplink.localhost:3000;
  // the viewer cookie is host-only, so a redirect to another host would lose it.
  const local = (path: string, host = "app.getuplink.localhost:3000", forwarded?: string) =>
    new Request(`http://localhost:3000${path}`, { headers: { host, ...(forwarded ? { "x-forwarded-host": forwarded } : {}) } });

  test("an unknown link goes to the ended page on the browser's host", async () => {
    const res = await openLink(local("/v/notarealtoken"), { params: Promise.resolve({ token: "notarealtoken" }) });
    expect(res.headers.get("location")).toBe("http://app.getuplink.localhost:3000/v/ended");
  });

  test("an open link goes to /v/open on the browser's host, with its pending cookie", async () => {
    const token = await make();
    const res = await openLink(local(`/v/${token}`), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toBe("http://app.getuplink.localhost:3000/v/open");
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${VIEW_PENDING_COOKIE}=`) && !c.includes("Max-Age=0"))).toBe(true);
  });

  test("signing out after a revoked session, and the proxy's not-signed-in redirect, keep the browser's host", async () => {
    const { GET: signedOut } = await import("@/app/api/auth/signed-out/route");
    const out = await signedOut(new NextRequest("http://localhost:3000/api/auth/signed-out", { headers: { host: "app.getuplink.localhost:3000" } }));
    expect(out.headers.get("location")).toBe("http://app.getuplink.localhost:3000/home");
    const page = await proxy(new NextRequest("http://localhost:3000/stats/driving", { headers: { host: "app.getuplink.localhost:3000" } }));
    expect(page.headers.get("location")).toBe("http://app.getuplink.localhost:3000/home");
  });

  test("Exit, and the forwarded host when there is one", async () => {
    expect((await leave(local("/v/leave"))).headers.get("location")).toBe("http://app.getuplink.localhost:3000/home");
    expect((await leave(local("/v/leave", "internal:3000", "app.getuplink.in"))).headers.get("location")).toBe("http://app.getuplink.in/home");
  });
});

describe("invoices are never a guest's", () => {
  test("both download routes refuse a guest, even past the proxy, whatever the link hides", async () => {
    fake.tables.charge_receipts = [{ user_id: 1, session_id: 501, invoice_path: "1/501.pdf" }];
    for (const hides of [{ hideLocations: false }, { hideLocations: true }]) {
      jar.clear();
      await visit(await make(OWNER, "Dad", "30m", hides));
      const before = fetches.length;
      expect((await receiptFile(new Request("https://app.getuplink.in/api/charging/receipt/501"), { params: Promise.resolve({ id: "501" }) })).status).toBe(401);
      expect((await teslaInvoice(new Request("https://app.getuplink.in/api/charging/invoice/made-up-id"), { params: Promise.resolve({ id: "made-up-id" }) })).status).toBe(401);
      expect(fetches.length).toBe(before);
    }
  });
});

describe("the invoice files are never a guest's", () => {
  test("every call on the bucket throws for a guest, downloads and signed links included", () => {
    const guest = ownerDb(asViewer(1, "made-up-owner")).invoices();
    for (const call of [
      () => guest.download("1/501.pdf"),
      () => guest.createSignedUrl("1/501.pdf", 60),
      () => guest.createSignedUrls(["1/501.pdf"], 60),
      () => guest.list("1"),
      () => guest.upload("1/501.pdf", new Blob(["x"])),
      () => guest.remove(["1/501.pdf"]),
    ])
      expect(call).toThrow(ViewOnlyWrite);
  });
});

describe("Settings' list", () => {
  test("says whether each link was opened, and when, in plain words", () => {
    const now = Date.parse("2026-10-30T06:00:00Z");
    expect(openedLine({ lastViewedAt: null }, now)).toBe("Not opened yet");
    expect(openedLine({ lastViewedAt: "2026-10-30T05:29:00Z" }, now)).toBe("Your guest opened it at 10:59 AM");
    expect(openedLine({ lastViewedAt: "2026-10-28T05:29:00Z" }, now)).toBe("Your guest opened it on 28 Oct, 10:59 AM");
  });

  test("Copy link shows only until the link is used", () => {
    expect(isUsedLink({ lastViewedAt: null })).toBe(false);
    expect(isUsedLink({ lastViewedAt: "2026-10-30T05:29:00Z" })).toBe(true);
    const settings = readFileSync(join(ROOT, "app/settings/view-links.tsx"), "utf8");
    expect(settings).toMatch(/\{!isUsedLink\(link\) && <CopyLinkButton /);
  });

  test("the ended page says the link has expired, for an ended, expired, unknown or used link", () => {
    expect(LINK_ENDED_TITLE).toBe("This link has expired");
    expect(LINK_ENDED_BODY).toBe("Ask the owner for a new one.");
  });

  test("the guest pill is drawn open unless folded by its cookie, and always open in the link's last 5 minutes", () => {
    const now = Date.parse("2026-10-30T06:00:00Z");
    const ends = (min: number) => new Date(now + min * MIN).toISOString();
    expect(viewBarOpen(undefined, ends(30), now)).toBe(true);
    expect(viewBarOpen("hidden", ends(30), now)).toBe(false);
    expect(viewBarOpen("hidden", ends(5), now)).toBe(true);
    expect(viewBarOpen("anything", ends(30), now)).toBe(true);
  });

  test("the first script marks the pill open or folded exactly as the server draws it, and never for an owner", () => {
    const now = Date.now();
    const run = (cookie: string) => {
      const dataset: Record<string, string> = {};
      new Function("document", GUEST_SCRIPT)({ cookie, documentElement: { dataset } });
      return dataset.guest;
    };
    const hint = (min: number) => `tiu_guest=${Math.floor((now + min * MIN) / 1000)}`;
    for (const [cookie, min] of [["", 30], ["tiu_view_bar=hidden", 30], ["tiu_view_bar=hidden", 4], ["tiu_view_bar=x", 30]] as const) {
      const expiresAt = new Date(Math.floor((now + min * MIN) / 1000) * 1000).toISOString();
      const want = viewBarOpen(cookie ? cookie.split("=")[1] : undefined, expiresAt, now) ? "open" : "folded";
      expect({ cookie, min, mark: run([hint(min), cookie].filter(Boolean).join("; ")) }).toEqual({ cookie, min, mark: want });
    }
    // No hint (an owner, or cookies off), or one past its end: no mark, nothing changes.
    expect(run("tiu_session=x; tiu_view_bar=hidden")).toBeUndefined();
    expect(run(hint(-1))).toBeUndefined();
    expect(run("not_tiu_guest=99999999999")).toBeUndefined();
  });
});

// ---- Static guards: a viewer reaches only reads ----

const ROOT = join(import.meta.dir, "..");
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const READER = /\b(currentReader|requireReader)\b/;

// Server actions that only read ("Show more" under a list): the only ones a viewer may call.
const READ_ONLY_ACTIONS = ["app/stats/driving/actions.ts", "app/stats/charging/actions.ts", "app/stats/battery/actions.ts", "app/updates/actions.ts"];
// What each of them exports: every one a "more…" list read.
const READ_ONLY_EXPORTS = /^export async function (more[A-Z]\w*)\(/gm;

describe("viewers stay read-only", () => {
  test('no "use server" file accepts a viewer, except the "Show more" reads', () => {
    const actionFiles = files("app").filter((f) => /^\s*["']use server["']/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(actionFiles.length).toBeGreaterThan(10);
    const readers = actionFiles.filter((f) => READER.test(code(readFileSync(join(ROOT, f), "utf8")))).map((f) => relative(".", f).split("\\").join("/"));
    expect(readers.sort()).toEqual([...READ_ONLY_ACTIONS].sort());
    for (const f of READ_ONLY_ACTIONS) {
      const source = code(readFileSync(join(ROOT, f), "utf8"));
      const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
      expect({ f, exported }).toEqual({ f, exported: [...source.matchAll(READ_ONLY_EXPORTS)].map((m) => m[1]) });
      // And none of them writes or calls Tesla.
      expect(source).not.toMatch(/\b(updateTag|revalidateTag|revalidatePath|insert|upsert|fleetGet|checkNow)\b/);
    }
  });

  test("no API route accepts a viewer", () => {
    const readers = files("app/api").filter((f) => READER.test(code(readFileSync(join(ROOT, f), "utf8"))));
    expect(readers).toEqual([]);
  });

  test("the setup gate and background syncs run for the owner's own session only", () => {
    const header = code(readFileSync(join(ROOT, "components/header.tsx"), "utf8"));
    const gate = header.slice(header.indexOf("async function SetupGate"), header.indexOf("function SetupNote"));
    expect(gate).toContain("currentOwner()");
    expect(gate).not.toMatch(READER);
    expect(code(readFileSync(join(ROOT, "components/background-sync.tsx"), "utf8"))).not.toMatch(READER);
  });
});

describe("a guest never gets the owner's ids", () => {
  // A "use cache: private" result can be handed to the browser (a runtime prefetch), a guest's included:
  // none returns the Owner (user id and Tesla account id) or its sub.
  test("no page's private cache returns the Owner", () => {
    const offenders: string[] = [];
    for (const f of [...files("app"), ...files("components")]) {
      const source = code(readFileSync(join(ROOT, f), "utf8"));
      for (const m of source.matchAll(/"use cache: private";([\s\S]*?)\n}\n/g)) {
        const body = m[1];
        if (/return\s*\{[^;]*?[{,]\s*owner\s*[,}:]/.test(body) || /return\s+owner\b/.test(body) || /\.sub\b/.test(body.replace(/currentOwner\(\)\)\?\.sub/, ""))) offenders.push(f);
      }
    }
    // The header's avatar seed reads the owner's own session (currentOwner), never a guest's.
    expect(offenders).toEqual([]);
    expect(code(readFileSync(join(ROOT, "app/stats/driving/[start]/page.tsx"), "utf8"))).not.toMatch(/Promise<\{ owner: Owner/);
  });

  test("Compare's own figures carry neither the account id nor the VIN hash", async () => {
    const owners = code(readFileSync(join(ROOT, "lib/server/owners.ts"), "utf8"));
    expect(owners).toContain('you: OwnSummary | null');
    expect(owners).not.toMatch(/kind: "ready"[^\n]*\byou,/);
  });
});

describe("a guest sees nothing addressed to the owner", () => {
  const OWNER_PATHS = /href="\/(settings|setup)\b|Sign in with Tesla|Settings/;

  test("home's notices and Compare's sharing pieces, drawn for a guest, link nowhere owner-only", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { OwnerNotices } = await import("@/components/owner-notices");
    const { GuestNotSharing, GuestSharingLine } = await import("@/components/owners/guest-lines");
    const gates = [
      { kind: "misconfigured", missing: ["MADE_UP_ENV"] },
      { kind: "error", message: "made-up" },
      { kind: "disconnected" },
      { kind: "ready" },
    ];
    for (const data of gates) {
      const html = renderToStaticMarkup(createElement(OwnerNotices, { data: data as never, count: 0, failedRun: null, viewer: true }));
      expect({ kind: data.kind, html: OWNER_PATHS.test(html) || html.includes("MADE_UP_ENV") }).toEqual({ kind: data.kind, html: false });
    }
    // The owner's own notice does offer sign-in, so the check above can fail.
    expect(renderToStaticMarkup(createElement(OwnerNotices, { data: { kind: "disconnected" } as never, count: 0, failedRun: null }))).toMatch(/Connect your Tesla account/);
    for (const html of [renderToStaticMarkup(createElement(GuestNotSharing)), renderToStaticMarkup(createElement(GuestSharingLine, { text: "The owner shares this car's figures." }))]) {
      expect(html).not.toMatch(OWNER_PATHS);
      expect(html).not.toMatch(/You're sharing|You&#x27;re sharing|Share/);
    }
  });

  test("home and Compare choose the guest pieces for a guest, server-side", () => {
    const home = code(readFileSync(join(ROOT, "app/page.tsx"), "utf8"));
    expect(home).toContain("{!viewer && <ShareNudgeCard");
    expect(home).toContain("{!viewer && car.vehicle.id === primaryId && <TyreNotice");
    expect(home).toContain("viewer={viewer} />");
    const compare = code(readFileSync(join(ROOT, "app/owners/page.tsx"), "utf8"));
    expect(compare).toContain("guest ? <GuestNotSharing /> : <NotSharing");
    expect(compare.match(/guest \? <GuestSharingLine/g)?.length).toBe(2);
    // No control is hidden by CSS any more: a guest's page never holds it.
    for (const f of [...files("app"), ...files("components")]) expect({ f, css: readFileSync(join(ROOT, f), "utf8").includes("data-owner-only") }).toEqual({ f, css: false });
  });

  test("the guest pill floats at the bottom centre, says it is guest mode and offers Hide and Exit; the nav has no Leave", () => {
    const bar = readFileSync(join(ROOT, "components/viewer-bar.tsx"), "utf8");
    expect(bar).toMatch(/fixed left-1\/2 [^"]*-translate-x-1\/2[^"]*rounded-full/);
    expect(bar).toContain("bottom-[max(1rem,env(safe-area-inset-bottom))]");
    expect(bar).toContain(">\n        Hide\n");
    // Room for it below every guest page's last content; none at the top any more.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    expect(css).toMatch(/html\[data-guest\] body \{\s*padding-bottom:/);
    expect(css).not.toContain("--guest-band");
    expect(bar).toContain("Exit");
    expect(bar).toContain("using guest mode");
    expect(bar).not.toContain("Stop viewing");
    expect(bar).toContain('href="/v/leave"');
    expect(readFileSync(join(ROOT, "components/header.tsx"), "utf8")).not.toMatch(/>\s*Leave\s*</);
  });
});

describe("/v/open while it claims", () => {
  test("shows nothing while the link opens: its words only after a failed claim, or with scripts off", () => {
    const page = readFileSync(join(ROOT, "app/v/open/page.tsx"), "utf8");
    const claim = readFileSync(join(ROOT, "app/v/open/claim.tsx"), "utf8");
    // The page renders the claim; its title is only in the <noscript> copy for a browser without scripts.
    expect(page).toContain("<Claim />");
    const outsideNoscript = page.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    expect(outsideNoscript).not.toMatch(/OPEN_TITLE\}|Opening guest view|<PlainPage/);
    expect(page).toMatch(/<noscript>[\s\S]*title=\{OPEN_TITLE\}[\s\S]*<\/noscript>/);
    expect(readFileSync(join(ROOT, "app/v/open/words.ts"), "utf8")).toContain('"Opening guest view"');
    // The claim draws nothing until it fails, then the full page with the error and Try again.
    expect(claim).toMatch(/if \(!failed\) return null;[\s\S]*<PlainPage[\s\S]*Try again/);
  });
});

describe("a link opened in two tabs, and the edges of /v", () => {
  const visitAs = (path: string, cookie?: string) =>
    proxy(new NextRequest(`https://app.getuplink.in${path}`, { headers: { host: "app.getuplink.in", ...(cookie ? { cookie } : {}) } }));
  const jarCookie = () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");

  test("two tabs of one browser: the tab whose claim loses still opens, since the browser holds the link", async () => {
    const token = await make();
    // Both tabs open the link: one pending cookie, shared by the browser.
    keep(await open(token));
    const pending = jar.get(VIEW_PENDING_COOKIE)!;
    keep(await claim());
    expect(jar.has(VIEW_COOKIE)).toBe(true);
    // The other tab's post carries the same pending cookie and, by now, the viewer cookie the first tab won.
    jar.set(VIEW_PENDING_COOKIE, pending);
    const second = await claim();
    expect(second.status).toBe(200);
    expect(await opened(second)).toBe(true);
    keep(second);
    expect(jar.has(VIEW_COOKIE)).toBe(true);
    expect((await currentReader())?.viewer?.id).toBe(1);
  });

  test("a viewer cookie for another link doesn't make a lost claim open", async () => {
    const token = await make();
    await visit(await make(OWNER, "Mum"));
    keep(await open(token));
    const pending = jar.get(VIEW_PENDING_COOKIE)!;
    // Another browser claims it first.
    await views.claimViewLink(1, Date.now());
    jar.set(VIEW_PENDING_COOKIE, pending);
    expect(await opened(await claim())).toBe(false);
  });

  test("the ended page keeps a viewer cookie whose link is still open, and drops one whose link has ended", async () => {
    const token = await make();
    await visit(token);
    const live = await visitAs("/v/ended", `${jarCookie()}; ${GUEST_HINT_COOKIE}=1`);
    expect(live.status).toBe(410);
    const kept = live.headers.getSetCookie();
    expect(kept.some((c) => c.startsWith(`${VIEW_COOKIE}=;`))).toBe(false);
    expect(kept).toContainEqual(expect.stringMatching(/^tiu_view_new=; Path=\/v\/seen; Max-Age=0/));
    expect(kept).toContainEqual(expect.stringMatching(/^tiu_guest=; Path=\/; Max-Age=0/));
    await views.endViewLink(OWNER, 1, Date.now());
    const gone = (await visitAs("/v/ended", jarCookie())).headers.getSetCookie();
    expect(gone).toContainEqual(expect.stringMatching(/^tiu_view=; Path=\/; Max-Age=0/));
  });

  test("/v/seen answers 503, not the ended page, when the database fails", async () => {
    await visit(await make());
    fake.failing = ({ table }) => table === "car_view_links";
    const res = await claim();
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("the confirm page goes to the ended page for an unknown, ended or used link", async () => {
    const { default: confirm } = await import("@/app/v/[token]/confirm/page");
    const where = async (token: string) => {
      try {
        await confirm({ params: Promise.resolve({ token }) });
        return "rendered";
      } catch (err) {
        return String((err as { digest?: string }).digest).split(";")[2];
      }
    };
    const token = await make();
    expect(await where(token)).toBe("rendered");
    expect(await where("notarealtoken")).toBe("/v/ended");
    await visit(token);
    expect(await where(token)).toBe("/v/ended");
    jar.clear();
    const ended = await make(OWNER, "Mum");
    await views.endViewLink(OWNER, 2, Date.now());
    expect(await where(ended)).toBe("/v/ended");
  });

  test("bare /v and /v/ go to the ended page on the browser's host", async () => {
    for (const path of ["/v", "/v/"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { host: "app.getuplink.localhost:3000" } }));
      expect(res.headers.get("location")).toBe("http://app.getuplink.localhost:3000/v/ended");
    }
  });
});
