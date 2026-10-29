import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { FakeDb, type Row } from "./fake-db";

// The 15-minute station check across accounts, against a fake database and a fake Fleet API: one account
// whose Tesla call fails must not stop the next. Made-up accounts and VINs.

let fake: FakeDb;
// Fleet API answers per access token: the status for /api/1/vehicles, and every path asked.
let vehiclesStatus: Record<string, number> = {};
const asked: string[] = [];

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
for (const name of ["TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI"]) process.env[name] ??= "test";

const VIN = { 1: "TESTVIN000000000001", 2: "TESTVIN000000000002" } as Record<number, string>;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
  asked.push(`${token} ${new URL(url).pathname}`);
  const user = Number(token.replace("access-", ""));
  if (url.endsWith("/api/1/vehicles")) {
    const status = vehiclesStatus[token] ?? 200;
    if (status !== 200) return new Response("upstream error", { status });
    return Response.json({ response: [{ vin: VIN[user], state: "online" }] });
  }
  if (url.includes("/vehicle_data")) {
    return Response.json({ response: { charge_state: { charging_state: "Charging" }, drive_state: { latitude: 0, longitude: 0 } } });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const { checkStations } = await import("@/lib/server/station-check");

function account(id: number): Record<string, Row[]> {
  const startedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  return {
    users: [{ id, tesla_sub: `made-up-${id}`, status: "approved", role: "user", sessions_valid_after: "-infinity" }],
    user_tokens: [
      {
        user_id: id,
        access_token_enc: `enc:access-${id}`,
        refresh_token_enc: `enc:refresh-${id}`,
        expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString(),
        scope: "openid offline_access vehicle_device_data vehicle_location",
      },
    ],
    vehicles: [{ id: id * 100, user_id: id, vin: VIN[id], created_at: "2026-10-01T00:00:00Z", readings_from: "2026-10-01T00:00:00Z", readings_until: null }],
    stream_charge_sessions: [
      { id: id * 10, user_id: id, vin: VIN[id], started_at: startedAt, ended_at: null, supercharger: false, station_checked_at: null, station_name: null },
    ],
  };
}

beforeEach(() => {
  vehiclesStatus = {};
  asked.length = 0;
  const [a, b] = [account(1), account(2)];
  fake = new FakeDb(Object.fromEntries(Object.keys(a).map((t) => [t, [...a[t], ...b[t]]])));
});

describe("checkStations", () => {
  test("an account whose Tesla call fails is skipped, and the accounts after it are still checked", async () => {
    vehiclesStatus["access-1"] = 500;
    await checkStations();
    expect(asked).toContain(`access-2 /api/1/vehicles/${VIN[2]}/vehicle_data`);
    const second = fake.rows("stream_charge_sessions").find((r) => r.user_id === 2)!;
    expect(second.station_checked_at).not.toBeNull();
  });

  test("past its time budget it starts no more accounts and says it isn't done", async () => {
    let now = 0;
    // Each read of the clock moves it a minute on, so the second account starts past the 45 s budget.
    const result = await checkStations(() => (now += 60_000));
    expect(result.done).toBe(false);
    expect(asked.some((a) => a.startsWith("access-2"))).toBe(false);
  });
});
