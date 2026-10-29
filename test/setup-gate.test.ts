import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type { Owner } from "@/lib/server/data/owner";
import { telemetryFields } from "@/lib/telemetry-fields.mjs";
import { FakeDb, type Row } from "./fake-db";

// The setup gate and /setup against a fake database and a fake Fleet API: what Tesla is asked, what's
// stored, who is sent to /setup, and when Uplink sends a car its streaming config. VINs are made up.

const OWNER_VIN = "TESTVIN0000000OWNER";
const NEW_VIN = "TESTVIN00000000NEW1";

let fake: FakeDb;
// Pre-migration: the setup columns don't exist, so any query naming them fails as PostgREST would.
let missingColumns = false;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({
  db: () => {
    const client = fake.client();
    if (!missingColumns) return client;
    return {
      ...client,
      from: (table: string) => {
        const q = client.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
        const fail = { data: null, error: { code: "42703", message: "column vehicles.key_paired does not exist" } };
        const failing = new Proxy(q, {
          get(target, key: string) {
            if (key === "then") return (resolve: (v: unknown) => void) => resolve(fail);
            const fn = target[key];
            return typeof fn === "function" ? (...args: unknown[]) => (fn.apply(target, args), failing) : fn;
          },
        });
        return new Proxy(q, {
          get(target, key: string) {
            const fn = target[key];
            if ((key === "select" || key === "update") && typeof fn === "function") {
              return (...args: unknown[]) => {
                const names = JSON.stringify(args);
                const res = fn.apply(target, args);
                return /key_paired|streaming|telemetry_config_sent_at/.test(names) ? failing : res;
              };
            }
            return typeof fn === "function" ? fn.bind(target) : fn;
          },
        });
      },
    };
  },
}));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

// The Fleet API: which VINs have the key, which have a streaming config, and every request.
const tesla = {
  paired: new Set<string>(),
  configs: new Map<string, "synced" | "pending">(),
  failStatus: false,
  requests: [] as { method: string; path: string; body: unknown }[],
};

const realFetch = globalThis.fetch;
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  tesla.requests.push({ method, path: url.pathname, body });
  if (url.pathname === "/api/1/vehicles/fleet_status") {
    if (tesla.failStatus) return new Response("upstream", { status: 503 });
    const vins = (body as { vins: string[] }).vins;
    return Response.json({
      response: {
        key_paired_vins: vins.filter((v) => tesla.paired.has(v)),
        unpaired_vins: vins.filter((v) => !tesla.paired.has(v)),
        vehicle_info: {},
      },
    });
  }
  if (url.pathname === "/api/1/vehicles/fleet_telemetry_config_jws") {
    const { vins } = body as { vins: string[] };
    const missing = vins.filter((v) => !tesla.paired.has(v));
    for (const v of vins) if (tesla.paired.has(v)) tesla.configs.set(v, "pending");
    return Response.json({ response: { updated_vehicles: vins.length - missing.length, skipped_vehicles: { missing_key: missing } } });
  }
  const config = url.pathname.match(/^\/api\/1\/vehicles\/([^/]+)\/fleet_telemetry_config$/);
  if (config) {
    const state = tesla.configs.get(decodeURIComponent(config[1]));
    return Response.json({ response: { synced: state === "synced", config: state ? { hostname: "telemetry.example" } : null, limit_reached: false } });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
process.env.TESLA_PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIVATE_PEM = privateKey.export({ type: "sec1", format: "pem" }).toString();
const CA_PEM = "-----BEGIN CERTIFICATE-----\nTESTCA\n-----END CERTIFICATE-----";

const { asOwner } = await import("@/lib/server/data/owner");
const { loadSetup, setupGate, checkSetup } = await import("@/lib/server/setup");
const OWNER: Owner = asOwner(1, "owner");
const NEW_USER: Owner = asOwner(2, "new");

const tokens = (userId: number) => ({
  user_id: userId,
  access_token_enc: "enc:token",
  refresh_token_enc: "enc:refresh",
  expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  scope: "openid offline_access vehicle_device_data vehicle_location",
  refreshing_until: null,
});
const vehicle = (userId: number, vin: string): Row => ({ user_id: userId, id: userId * 100, vin, display_name: null, readings_until: null });

const NOW = Date.now();
const MIN = 60_000;
const carRow = (vin: string) => fake.rows("vehicles").find((r) => r.vin === vin)!;
const asked = (path: string) => tesla.requests.filter((r) => r.path === path).length;
const counted = (kind: string) => fake.rpcs.filter((r) => r.fn === "increment_api_usage" && r.args.p_kind === kind).length;

beforeEach(() => {
  globalThis.fetch = fakeFetch;
  missingColumns = false;
  Object.assign(tesla, { paired: new Set([OWNER_VIN]), configs: new Map([[OWNER_VIN, "synced"]]), failStatus: false, requests: [] });
  fake = new FakeDb({ user_tokens: [tokens(1), tokens(2)], vehicles: [vehicle(1, OWNER_VIN), vehicle(2, NEW_VIN)] });
  process.env.TESLA_PRIVATE_KEY_PEM = PRIVATE_PEM;
  process.env.TELEMETRY_CA_PEM = CA_PEM;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.TESLA_PRIVATE_KEY_PEM;
  delete process.env.TELEMETRY_CA_PEM;
  delete process.env.TESLA_PUBLIC_KEY_PEM;
});

describe("the setup gate", () => {
  test("the owner, whose car has the key, is never gated, and Tesla is asked once, not per view", async () => {
    expect(await setupGate(OWNER, { now: NOW })).toBe("pass");
    expect(await setupGate(OWNER, { now: NOW + 5 * MIN })).toBe("pass");
    expect(await setupGate(OWNER, { now: NOW + 59 * MIN })).toBe("pass");
    expect(asked("/api/1/vehicles/fleet_status")).toBe(1);
    expect(carRow(OWNER_VIN).key_paired).toBe(true);
    expect(counted("fleet_status")).toBe(1);
  });

  test("a car that has sent nothing for an hour has its key checked again, and a removed key is caught", async () => {
    expect(await setupGate(OWNER, { now: NOW })).toBe("pass");
    // The key is removed from the car; it sends nothing from then on (this fake has no readings at all).
    tesla.paired.clear();
    expect(await setupGate(OWNER, { now: NOW + 60 * MIN })).toBe("setup");
    expect(asked("/api/1/vehicles/fleet_status")).toBe(2);
    expect(carRow(OWNER_VIN).key_paired).toBe(false);
  });

  test("the admin is passed without asking Tesla", async () => {
    tesla.paired.clear();
    expect(await setupGate(OWNER, { admin: true, now: NOW })).toBe("pass");
    expect(tesla.requests).toHaveLength(0);
  });

  test("the admin is told, from what's stored, when the key was removed from the car", async () => {
    // The health check stored Tesla's answer (recordKeyStatus); the admin's page still asks Tesla nothing.
    Object.assign(carRow(OWNER_VIN), { key_paired: false, key_checked_at: new Date(NOW).toISOString() });
    expect(await setupGate(OWNER, { admin: true, now: NOW })).toBe("key-removed");
    expect(tesla.requests).toHaveLength(0);
  });

  test("a new owner without the key is sent to /setup, rechecked at most every 10 minutes", async () => {
    expect(await setupGate(NEW_USER, { now: NOW })).toBe("setup");
    expect(await setupGate(NEW_USER, { now: NOW + 9 * MIN })).toBe("setup");
    expect(asked("/api/1/vehicles/fleet_status")).toBe(1);
    tesla.paired.add(NEW_VIN);
    expect(await setupGate(NEW_USER, { now: NOW + 10 * MIN })).toBe("pass");
    expect(asked("/api/1/vehicles/fleet_status")).toBe(2);
  });

  test("a Tesla error never gates: a note, and no second request within 10 minutes", async () => {
    tesla.failStatus = true;
    expect(await setupGate(NEW_USER, { now: NOW })).toBe("unknown");
    expect(await setupGate(NEW_USER, { now: NOW + MIN })).toBe("unknown");
    expect(asked("/api/1/vehicles/fleet_status")).toBe(1);
    // A 503 isn't billed, so it isn't counted.
    expect(counted("fleet_status")).toBe(0);
  });

  test("before the migration nobody is gated and Tesla isn't asked", async () => {
    missingColumns = true;
    tesla.paired.clear();
    expect(await setupGate(NEW_USER, { now: NOW })).toBe("pass");
    expect(await setupGate(OWNER, { now: NOW })).toBe("pass");
    expect(tesla.requests).toHaveLength(0);
  });
});

describe("/setup and the streaming config", () => {
  test("once the key is on, Uplink sends the car the same config the script sends, once", async () => {
    tesla.paired.add(NEW_VIN);
    const view = await loadSetup(NEW_USER, { now: NOW });
    const sent = tesla.requests.filter((r) => r.path === "/api/1/vehicles/fleet_telemetry_config_jws");
    expect(sent).toHaveLength(1);
    const { vins, token } = sent[0].body as { vins: string[]; token: string };
    expect(vins).toEqual([NEW_VIN]);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(claims.fields).toEqual(telemetryFields());
    expect(claims).toMatchObject({ hostname: "telemetry.getuplink.in", port: 443, ca: CA_PEM, aud: "com.tesla.fleet.TelemetryClient" });
    expect(claims.exp - Math.floor(NOW / 1000)).toBe(360 * 24 * 3600);
    expect(JSON.stringify(sent[0].body)).not.toContain("PRIVATE KEY");
    expect(view.cars[0].streaming).toBe("pending");
    expect(carRow(NEW_VIN).telemetry_config_sent_at).toBeTruthy();
    expect(counted("telemetry_config")).toBe(2); // the read, then the send

    // "Check again" a minute later: the car has a config now, so nothing is sent again.
    await loadSetup(NEW_USER, { force: true, now: NOW + MIN });
    expect(tesla.requests.filter((r) => r.path === "/api/1/vehicles/fleet_telemetry_config_jws")).toHaveLength(1);
  });

  test("the owner's car, already streaming, is never sent a config", async () => {
    await loadSetup(OWNER, { now: NOW });
    await loadSetup(OWNER, { force: true, now: NOW + MIN });
    await checkSetup(OWNER, NOW + 2 * PAIRED_DAY);
    expect(asked("/api/1/vehicles/fleet_telemetry_config_jws")).toBe(0);
    expect(carRow(OWNER_VIN).streaming).toBe("synced");
  });

  test("without the keys set, nothing is sent and the page says Uplink will turn it on", async () => {
    delete process.env.TESLA_PRIVATE_KEY_PEM;
    tesla.paired.add(NEW_VIN);
    const view = await loadSetup(NEW_USER, { now: NOW });
    expect(view.canSend).toBe(false);
    expect(asked("/api/1/vehicles/fleet_telemetry_config_jws")).toBe(0);
    expect(view.cars[0].streaming).toBe("none");
  });

  test("a private key that isn't the published one is refused, and nothing is sent", async () => {
    process.env.TESLA_PRIVATE_KEY_PEM = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "sec1", format: "pem" }).toString();
    tesla.paired.add(NEW_VIN);
    await loadSetup(NEW_USER, { now: NOW });
    expect(asked("/api/1/vehicles/fleet_telemetry_config_jws")).toBe(0);
  });

  test("without the location scope nothing is sent (Tesla requires it for Location), and /setup says so", async () => {
    fake.rows("user_tokens").find((r) => r.user_id === 2)!.scope = "openid offline_access vehicle_device_data";
    tesla.paired.add(NEW_VIN);
    const view = await loadSetup(NEW_USER, { now: NOW });
    expect(view.needsLocation).toBe(true);
    expect(asked("/api/1/vehicles/fleet_telemetry_config_jws")).toBe(0);
    expect(carRow(NEW_VIN).telemetry_config_sent_at).toBeUndefined();
  });

  test("the 6-hourly check sends the config to a car paired while nobody had /setup open", async () => {
    tesla.paired.add(NEW_VIN);
    await checkSetup(NEW_USER, NOW);
    expect(asked("/api/1/vehicles/fleet_telemetry_config_jws")).toBe(1);
  });
});

const PAIRED_DAY = 24 * 60 * MIN;
