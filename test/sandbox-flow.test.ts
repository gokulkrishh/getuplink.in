import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

// docs/sandbox.md's test script, end to end through the real route handlers (/api/auth/connect, the
// callback) and server actions (Access, the invite page, Reset), with the sandbox on: its fake Tesla and
// its in-memory database, nothing else faked but Next's request scope (cookies, headers, redirect, after).
//
// Every other test file mocks the database module, and bun test shares one module registry, so this file
// runs itself again in a child `bun test` with a clean registry and the sandbox's env (NODE_ENV development,
// UPLINK_SANDBOX=1). The child is the one that runs the flow; the suite only checks it passed.

const CHILD = process.env.SANDBOX_FLOW_CHILD === "1";

if (!CHILD) {
  describe("the sandbox test script", () => {
    test("runs end to end in a fresh process", () => {
      const run = Bun.spawnSync(["bun", "test", join(import.meta.dir, "sandbox-flow.test.ts")], {
        cwd: join(import.meta.dir, ".."),
        env: {
          ...process.env,
          SANDBOX_FLOW_CHILD: "1",
          NODE_ENV: "development",
          UPLINK_SANDBOX: "1",
          // Real-looking settings the sandbox must ignore.
          SUPABASE_URL: "https://realprojectrefabcdef.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "real-service-role-key",
          TESLA_CLIENT_ID: "real-client",
          SIGNUP_MODE: "open",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = `${run.stdout.toString()}\n${run.stderr.toString()}`;
      if (run.exitCode !== 0) console.error(out);
      expect(run.exitCode).toBe(0);
      expect(out).toMatch(/\b[1-9]\d* pass\b/);
      expect(out).toMatch(/\b0 fail\b/);
    }, 60_000);
  });
} else {
  // ---- The child: the flow itself ----

  // A browser: its cookies and its address. Private windows are separate browsers.
  class Browser {
    jar = new Map<string, string>();
    constructor(readonly ip: string) {}
    header() {
      return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    take(res: Response) {
      for (const line of res.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split(";");
        const [name, ...rest] = pair.split("=");
        const value = rest.join("=");
        const gone = attrs.some((a) => /max-age=0\b/i.test(a.trim()) || /expires=Thu, 01 Jan 1970/i.test(a.trim()));
        if (gone || value === "") this.jar.delete(name.trim());
        else this.jar.set(name.trim(), value);
      }
    }
  }

  let current: Browser;
  const afters: Promise<unknown>[] = [];
  class Redirected extends Error {
    constructor(readonly location: string) {
      super(`redirect ${location}`);
    }
  }

  mock.module("server-only", () => ({}));
  // The real Supabase client must never be made: db() hands out the sandbox's database instead.
  let clientsMade = 0;
  mock.module("@supabase/supabase-js", () => ({
    createClient: () => {
      clientsMade++;
      throw new Error("A Supabase client was made in the sandbox");
    },
  }));
  // Nor may anything reach the network: the fake Tesla answers in process.
  globalThis.fetch = (async (input: string | URL | Request) => {
    throw new Error(`Network request in the sandbox flow: ${String(input instanceof Request ? input.url : input)}`);
  }) as unknown as typeof fetch;
  mock.module("next/headers", () => ({
    cookies: async () => ({
      get: (name: string) => (current.jar.has(name) ? { name, value: current.jar.get(name)! } : undefined),
      set: (name: string, value: string) => void current.jar.set(name, value),
      delete: (name: string | { name: string }) => void current.jar.delete(typeof name === "string" ? name : name.name),
    }),
    headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": current.ip }),
  }));
  mock.module("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, revalidateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
  mock.module("next/navigation", () => ({
    redirect: (to: string) => {
      throw new Redirected(to);
    },
    notFound: () => {
      throw new Error("not found");
    },
  }));
  const realServer = { ...(await import("next/server")) };
  mock.module("next/server", () => ({ ...realServer, after: (fn: () => unknown) => void afters.push(Promise.resolve().then(fn)) }));

  const { NextRequest } = realServer;
  const { sandboxOn, envValue } = await import("@/lib/sandbox/flag");
  const { sandboxStore, resetSandboxStore } = await import("@/lib/sandbox/db");
  const { sandboxTeslaCalls } = await import("@/lib/sandbox/tesla");
  const { EUROPE_BASE } = await import("@/lib/sandbox/accounts");
  const connect = await import("@/app/api/auth/connect/route");
  const callback = await import("@/app/api/auth/callback/route");
  const { createInviteLink, decideAccount, revokeInviteLink } = await import("@/app/admin/waitlist/actions");
  const { startInviteSignIn } = await import("@/app/invite/[token]/actions");
  const { resetSandbox } = await import("@/app/sandbox/actions");
  const { loadInvites, lookupInvite } = await import("@/lib/server/invites");
  const { currentOwner } = await import("@/lib/server/auth");
  const { loadOwnerCars } = await import("@/lib/server/dashboard");
  const { env, signupMode } = await import("@/lib/server/env");
  const { LOGIN_ERRORS } = await import("@/lib/login-errors");

  const ORIGIN = "http://localhost:3000";
  const request = (b: Browser, path: string) =>
    new NextRequest(new URL(path, ORIGIN), { headers: { cookie: b.header(), host: "localhost:3000", "x-forwarded-for": b.ip } });

  // Follows a route handler or action to wherever it sends the browser, and runs what it left for after().
  async function route(b: Browser, handler: (req: InstanceType<typeof NextRequest>) => Promise<Response>, path: string): Promise<URL> {
    const res = await handler(request(b, path));
    b.take(res);
    await Promise.all(afters.splice(0));
    return new URL(res.headers.get("location")!, ORIGIN);
  }
  async function action(b: Browser, run: () => Promise<unknown>): Promise<unknown> {
    current = b;
    try {
      return await run();
    } catch (err) {
      if (err instanceof Redirected) return new URL(err.location, ORIGIN);
      throw err;
    }
  }

  // The fake Tesla sign-in page: choosing an account goes back to the callback with its key as the code.
  async function teslaLogin(b: Browser, authorize: URL, account: string): Promise<URL> {
    expect(authorize.pathname).toBe("/sandbox/tesla-login");
    const state = authorize.searchParams.get("state")!;
    return route(b, callback.GET, `/api/auth/callback?${new URLSearchParams({ code: account, state })}`);
  }
  const signInFromHome = async (b: Browser, account: string) => teslaLogin(b, await route(b, connect.GET, "/api/auth/connect"), account);
  async function signInFromInvite(b: Browser, link: string, account: string) {
    const token = new URL(link).pathname.split("/").pop()!;
    const authorize = (await action(b, () => startInviteSignIn(token))) as URL;
    return teslaLogin(b, authorize, account);
  }
  const errorOf = (landed: URL) => landed.searchParams.get("error");
  const signedInAs = async (b: Browser) => {
    current = b;
    return currentOwner();
  };
  async function createInvite(owner: Browser, vin: string, label: string): Promise<string> {
    const form = new FormData();
    form.set("vin", vin);
    form.set("label", label);
    const result = (await action(owner, () => createInviteLink(null, form))) as { url?: string; message?: string };
    expect(result.message).toBeUndefined();
    return result.url!;
  }
  const inviteRow = (vin: string) => sandboxStore().rows("invites").find((r) => r.vin_suffix === vin)!;

  describe("sandbox isolation", () => {
    test("the sandbox is on, and the real settings are ignored", () => {
      expect(sandboxOn()).toBe(true);
      expect(env("SUPABASE_URL")).not.toContain("supabase.co");
      expect(envValue("SUPABASE_SERVICE_ROLE_KEY")).toBe("sandbox-not-a-key");
      expect(env("TESLA_CLIENT_ID")).toBe("sandbox-client");
      expect(signupMode()).toBe("invite");
    });
  });

  describe("docs/sandbox.md, end to end", () => {
    test("the whole script", async () => {
      resetSandboxStore();
      sandboxTeslaCalls().length = 0;
      const owner = new Browser("10.0.0.1");
      const p1 = new Browser("10.0.0.2");
      const p2 = new Browser("10.0.0.3");
      const p3 = new Browser("10.0.0.4");

      // 1. The owner signs in.
      expect((await signInFromHome(owner, "owner")).pathname).toBe("/");
      expect((await signedInAs(owner))?.userId).toBe(1);

      // 2. Invites on Access for SBX777 and ZZZ999.
      const friendLink = await createInvite(owner, "SBX777", "Friend's 3");
      const nobodyLink = await createInvite(owner, "ZZZ999", "Nobody's car");
      expect(friendLink).toStartWith(`${ORIGIN}/invite/`);

      // 3. A private window: the ZZZ999 link refuses the friend and No-car (a different car), Europe (region).
      expect(await lookupInvite(new URL(nobodyLink).pathname.split("/").pop()!, Date.now())).toBe("unused");
      expect(errorOf(await signInFromInvite(p1, nobodyLink, "friend"))).toBe("invite-car");
      expect(errorOf(await signInFromInvite(p1, nobodyLink, "nocar"))).toBe("invite-car");
      expect(errorOf(await signInFromInvite(p1, nobodyLink, "europe"))).toBe("region");
      expect(LOGIN_ERRORS["invite-car"]).toContain("different car");
      // Refusals consume nothing and store nothing.
      expect(inviteRow("ZZZ999").used_at ?? null).toBeNull();
      expect(sandboxStore().rows("users")).toHaveLength(1);
      // Without an invite, No-car is told Uplink is invite-only.
      expect(errorOf(await signInFromHome(p1, "nocar"))).toBe("invite-only");
      expect(LOGIN_ERRORS["invite-only"]).toBe("Uplink is invite-only.");

      // 4. The friend joins through the SBX777 link, and the check after sign-in records their car.
      expect((await signInFromInvite(p1, friendLink, "friend")).pathname).toBe("/");
      const friend = (await signedInAs(p1))!;
      expect(friend.userId).toBe(2);
      const cars = await loadOwnerCars(friend);
      expect(cars.kind).toBe("ready");
      expect(cars.kind === "ready" && cars.vehicles.map((v) => v.vin)).toEqual(["LRW3E7EK1TCSBX777"]);

      // 5. Another private window: the used link says so, before Tesla.
      const friendToken = new URL(friendLink).pathname.split("/").pop()!;
      expect(await lookupInvite(friendToken, Date.now())).toBe("used");
      expect(((await action(p2, () => startInviteSignIn(friendToken))) as URL).pathname).toBe(`/invite/${friendToken}`);

      // 6. "Expired or used": the ZZZ999 link is revoked while this window is on Tesla's page.
      const nobodyToken = new URL(nobodyLink).pathname.split("/").pop()!;
      const authorize = (await action(p2, () => startInviteSignIn(nobodyToken))) as URL;
      expect(await action(owner, () => revokeInviteLink(inviteRow("ZZZ999").id as number, null))).toBeNull();
      expect(errorOf(await teslaLogin(p2, authorize, "nocar"))).toBe("invite-invalid");
      expect(LOGIN_ERRORS["invite-invalid"]).toContain("expired or was already used");

      // 7. The second driver of the owner's car joins through an SBX001 link; their window starts now.
      const driverLink = await createInvite(owner, "SBX001", "Second driver");
      expect((await signInFromInvite(p3, driverLink, "driver2")).pathname).toBe("/");
      const driver = (await signedInAs(p3))!;
      const driverCar = sandboxStore().rows("vehicles").find((v) => v.user_id === driver.userId)!;
      expect(driverCar.vin).toBe("LRWYGCEK3TCSBX001");
      expect(Date.parse(driverCar.readings_from as string)).toBeGreaterThan(Date.now() - 60_000);

      // 8. Access shows each used link with the model and the last 4 of the VIN.
      current = owner;
      const invites = await loadInvites(Date.now());
      const byVin = Object.fromEntries(invites.items.map((i) => [i.vinSuffix, i]));
      expect(byVin.SBX777).toMatchObject({ state: "used", joined: "Model 3 · X777", joinedApproved: true });
      expect(byVin.SBX001).toMatchObject({ state: "used", joined: "Model Y · X001", joinedApproved: true });
      expect(byVin.ZZZ999.state).toBe("revoked");

      // 9. Suspend: the friend's session stops working, and signing in again is refused.
      expect(await action(owner, () => decideAccount("suspend", byVin.SBX777.joinedUserId!, null))).toBeNull();
      expect(await signedInAs(p1)).toBeNull();
      expect(errorOf(await signInFromHome(p1, "friend"))).toBe("not-approved");

      // 10. Nothing reached anything but the fake Tesla, and Europe was asked its region.
      expect(sandboxTeslaCalls().some((c) => c.account === "europe" && c.path === "/api/1/users/region")).toBe(true);
      expect(EUROPE_BASE).toContain(".eu.");

      // 11. Reset: back to the owner alone, still signed in.
      expect(((await action(owner, () => resetSandbox())) as URL).pathname).toBe("/home");
      expect(sandboxStore().rows("users")).toHaveLength(1);
      expect(sandboxStore().rows("invites")).toHaveLength(0);
      expect((await signedInAs(owner))?.userId).toBe(1);
      expect(await signedInAs(p3)).toBeNull();
      expect(clientsMade).toBe(0);
    }, 30_000);
  });
}
