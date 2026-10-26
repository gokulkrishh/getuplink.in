import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// Two users' rows in one database, so a test can tell "the owner's rows" from "every row": one user never
// reads, changes or deletes the other's.

let fake: FakeDb;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

// Stopping the stream asks Tesla; nothing here needs it to succeed.
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

const { asOwner, ownerDb } = await import("@/lib/server/data/owner");
const { eraseOwnerRows } = await import("@/lib/server/data/erase");
const system = await import("@/lib/server/data/system");
const { deleteAccount, deleteMyData, disconnectTesla, isConnected, revokeAllSessions } = await import("@/lib/server/tesla");

const A: Owner = asOwner(1, "tesla-a");
const B: Owner = asOwner(2, "tesla-b");
const later = () => new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => {
  fake = new FakeDb({
    users: [
      { id: 1, tesla_sub: "tesla-a", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-01T00:00:00Z" },
      { id: 2, tesla_sub: "tesla-b", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-02T00:00:00Z" },
    ],
    user_tokens: [
      { user_id: 1, access_token_enc: "enc:a", refresh_token_enc: "enc:ra", expires_at: later(), updated_at: "2026-10-20T00:00:00Z" },
      { user_id: 2, access_token_enc: "enc:b", refresh_token_enc: "enc:rb", expires_at: later(), updated_at: "2026-10-20T00:00:00Z" },
    ],
    // Already moved at cutover: owner_sub kept, no pair.
    oauth_tokens: [{ provider: "tesla", owner_sub: "tesla-a", access_token_enc: null, refresh_token_enc: null }],
    vehicles: [
      { user_id: 1, id: "1", vin: "VIN_A" },
      { user_id: 2, id: "2", vin: "VIN_B" },
    ],
    charging_sessions: [
      { user_id: 1, session_id: "s1", vehicle_vin: "VIN_A" },
      { user_id: 2, session_id: "s2", vehicle_vin: "VIN_B" },
    ],
    stream_charge_sessions: [
      { user_id: 1, id: 10, vin: "VIN_A" },
      { user_id: 2, id: 20, vin: "VIN_B" },
    ],
    charge_receipts: [
      { user_id: 1, session_id: 10, invoice_path: "10/a.pdf" },
      { user_id: 2, session_id: 20, invoice_path: "20/b.pdf" },
    ],
    telemetry_readings: [
      { user_id: 1, id: 1, vin: "VIN_A", field: "Soc" },
      { user_id: 2, id: 2, vin: "VIN_B", field: "Soc" },
      // A's, for a VIN no car row of A's names any more.
      { user_id: 1, id: 3, vin: "VIN_GONE", field: "Soc" },
    ],
    poll_runs: [
      { user_id: 1, id: 1 },
      { user_id: 2, id: 2 },
    ],
    user_places: [
      { user_id: 1, id: 1, name: "Maple Court" },
      { user_id: 2, id: 2, name: "Cedar Park" },
    ],
    connector_token: [
      { user_id: 1, owner: "tesla", token_hash: "hash-a" },
      { user_id: 2, owner: "tesla", token_hash: "hash-b" },
    ],
  });
});

const column = (table: string, name: string) => fake.rows(table).map((r) => r[name]);

describe("ownerDb", () => {
  test("reaches the database only when a query is built", () => {
    const scope = ownerDb(A);
    scope.from("vehicles");
    expect(fake.clients).toBe(0);
    scope.from("vehicles").select("vin");
    expect(fake.clients).toBe(1);
  });

  test("one user never reads, changes or deletes the other's rows", async () => {
    for (const table of ["vehicles", "charging_sessions", "stream_charge_sessions", "charge_receipts", "poll_runs", "connector_token", "user_tokens"] as const) {
      const { data } = await ownerDb(A).from(table).select("*");
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((r) => r.user_id === 1)).toBe(true);
    }
    await ownerDb(B).from("vehicles").update({ display_name: "B's" });
    expect(column("vehicles", "display_name")).toEqual([undefined, "B's"]);
    await ownerDb(B).from("telemetry_readings").delete().in("vin", ["VIN_A", "VIN_B"]);
    expect(column("telemetry_readings", "id")).toEqual([1, 3]);
    expect(fake.calls.every((c) => c.filters.some((f) => /^user_id = [12]$/.test(f)))).toBe(true);
  });

  test("stamps the owner's user on what it writes", async () => {
    await ownerDb(B).from("connector_token").upsert({ token_hash: "new" }, { onConflict: "user_id" });
    expect(fake.rows("connector_token").find((r) => r.user_id === 2)?.token_hash).toBe("new");
    expect(fake.rows("connector_token").find((r) => r.user_id === 1)?.token_hash).toBe("hash-a");
    await ownerDb(B).from("snapshots").insert([{ vehicle_id: "2" }]);
    expect(fake.rows("snapshots")).toEqual([{ vehicle_id: "2", user_id: 2 }]);
  });

  test("calls the per-car functions for the owner's user", async () => {
    await ownerDb(B).rpc("counter_values_at", { p_vin: "VIN_B", p_fields: [], p_at: [], p_user_id: 1 });
    expect(fake.rpcs).toEqual([{ fn: "counter_values_at", args: { p_vin: "VIN_B", p_fields: [], p_at: [], p_user_id: 2 } }]);
  });
});

describe("account actions touch only the owner's account", () => {
  test("sign out everywhere", async () => {
    await revokeAllSessions(A);
    const [a, b] = fake.rows("users");
    expect(a.sessions_valid_after).not.toBe("-infinity");
    expect(b.sessions_valid_after).toBe("-infinity");
  });

  test("disconnect keeps the token row, empty, and leaves the other user connected", async () => {
    await disconnectTesla(A);
    const [a, b] = fake.rows("user_tokens");
    expect(a).toEqual(expect.objectContaining({ user_id: 1, access_token_enc: null, refresh_token_enc: null }));
    expect(b.access_token_enc).toBe("enc:b");
    expect(fake.rows("users")[1].sessions_valid_after).toBe("-infinity");
    expect(await isConnected(A)).toBe(false);
    expect(await isConnected(B)).toBe(true);
  });
});

describe("Delete my data", () => {
  test("deletes the owner's rows and files, and leaves another user's", async () => {
    await eraseOwnerRows(A);
    expect(column("vehicles", "vin")).toEqual(["VIN_B"]);
    expect(column("charging_sessions", "vehicle_vin")).toEqual(["VIN_B"]);
    expect(column("stream_charge_sessions", "vin")).toEqual(["VIN_B"]);
    // VIN_GONE was A's too.
    expect(column("telemetry_readings", "vin")).toEqual(["VIN_B"]);
    expect(column("charge_receipts", "session_id")).toEqual([20]);
    expect(column("poll_runs", "user_id")).toEqual([2]);
    expect(column("connector_token", "user_id")).toEqual([2]);
    expect(column("user_places", "name")).toEqual(["Cedar Park"]);
    expect(fake.removedFiles).toEqual(["10/a.pdf"]);
  });

  test("every delete is bound to the owner's user", async () => {
    await eraseOwnerRows(A);
    const deletes = fake.calls.filter((c) => c.op === "delete");
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) expect(d.filters).toContain("user_id = 1");
  });

  test("the whole action keeps the other user signed in and connected", async () => {
    await deleteMyData(A);
    const [a, b] = fake.rows("user_tokens");
    expect(a.access_token_enc).toBeNull();
    expect(b).toEqual(expect.objectContaining({ user_id: 2, access_token_enc: "enc:b" }));
    expect(fake.rows("users").map((u) => u.id)).toEqual([1, 2]);
    expect(fake.rows("users")[1].sessions_valid_after).toBe("-infinity");
    expect(column("vehicles", "vin")).toEqual(["VIN_B"]);
  });
});

describe("Delete account", () => {
  test("deletes the owner's data and users row, and nothing of the other user's", async () => {
    await deleteAccount(A);
    expect(fake.rows("users").map((u) => u.id)).toEqual([2]);
    expect(column("vehicles", "vin")).toEqual(["VIN_B"]);
    expect(column("telemetry_readings", "vin")).toEqual(["VIN_B"]);
    expect(fake.rows("user_tokens").find((r) => r.user_id === 2)?.access_token_enc).toBe("enc:b");
    expect(fake.calls.filter((c) => c.table === "users" && c.op === "delete")).toEqual([{ table: "users", op: "delete", filters: ["id = 1"] }]);
    // The single-owner row keeps naming its Tesla account (legacy_owner_id), with no tokens.
    expect(fake.rows("oauth_tokens")[0]).toEqual(expect.objectContaining({ owner_sub: "tesla-a", refresh_token_enc: null }));
  });
});

describe("fleet-wide reads", () => {
  test("the crons check approved users with tokens, except one who disconnected", async () => {
    fake.rows("users").push(
      { id: 3, tesla_sub: "tesla-c", status: "waitlist" },
      { id: 4, tesla_sub: "tesla-d", status: "approved" }, // approved from the waitlist, not signed in yet
      { id: 5, tesla_sub: "tesla-e", status: "suspended" },
    );
    fake.rows("user_tokens")[1].access_token_enc = null;
    expect((await system.accountOwners()).map((o) => o.userId)).toEqual([1]);
  });

  test("before the cutover, the old single owner is checked with no token row, so the check copies it", async () => {
    fake.tables.user_tokens = fake.rows("user_tokens").filter((r) => r.user_id !== 1);
    fake.rows("users").push({ id: 4, tesla_sub: "tesla-d", status: "approved" });
    expect((await system.accountOwners()).map((o) => o.userId)).toEqual([1, 2]);
  });

  test("a connector token opens only its own approved user", async () => {
    expect((await system.connectorTokenAccount("hash-b"))?.owner).toEqual(B);
    expect(await system.connectorTokenAccount("hash-x")).toBeNull();
    fake.rows("users")[1].status = "suspended";
    expect(await system.connectorTokenAccount("hash-b")).toBeNull();
  });

  test("the health check asks about a car with its own user's token", async () => {
    fake.tables.vehicles = [{ user_id: 2, id: "2", vin: "VIN_B" }];
    expect(await system.healthCheckCar()).toEqual({ owner: B, vin: "VIN_B" });
  });

  test("a car two users track counts once", async () => {
    fake.tables.vehicles = [
      { user_id: 2, id: "7", vin: "VIN_SHARED", current_version: "2026.38" },
      { user_id: 1, id: "7", vin: "VIN_SHARED", current_version: "2026.38" },
      { user_id: 2, id: "8", vin: "VIN_B", current_version: "2026.32" },
    ];
    fake.tables.version_history = [
      { user_id: 1, car: "7", version: "2026.38" },
      { user_id: 2, car: "7", version: "2026.38" },
      { user_id: 2, car: "8", version: "2026.32" },
    ];
    const cars = await system.fleetCars();
    expect(cars.map((c) => c.vin)).toEqual(["VIN_SHARED", "VIN_B"]);
    expect(cars.every((c) => !("user_id" in c))).toBe(true);
    expect((await system.fleetVersionChanges()).map((c) => c.car)).toEqual(["7", "8"]);
  });
});
