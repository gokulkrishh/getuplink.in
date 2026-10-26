import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// Two users' rows in one database, so a test can tell "the owner's rows" from "every row": one user never
// reads, changes or deletes the other's. They share one car, VIN_S: A has tracked it from the start, B
// added it on 15 Oct. Its readings are stored once (per VIN), and each sees them through their own car row.
// Made-up users, cars and places.

let fake: FakeDb;
let teslaCalls: { method: string; path: string }[];

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

// Stopping the stream asks Tesla; nothing here needs it to succeed, only to know which cars it asked about.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  teslaCalls.push({ method: init?.method ?? "GET", path: new URL(String(input)).pathname });
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;

const { asOwner, ownerDb } = await import("@/lib/server/data/owner");
const { eraseOwnerRows } = await import("@/lib/server/data/erase");
const system = await import("@/lib/server/data/system");
const { deleteAccount, deleteMyData, disconnectTesla, isConnected, revokeAllSessions } = await import("@/lib/server/tesla");
const { loadReadings, readingsBefore } = await import("@/lib/server/telemetry");
const { pruneTelemetry } = await import("@/lib/server/retention");

const A: Owner = asOwner(1, "tesla-a");
const B: Owner = asOwner(2, "tesla-b");
const later = () => new Date(Date.now() + 3_600_000).toISOString();
const B_ADDED = "2026-10-15T00:00:00.000Z";

beforeEach(() => {
  teslaCalls = [];
  fake = new FakeDb({
    users: [
      { id: 1, tesla_sub: "tesla-a", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-01T00:00:00Z" },
      { id: 2, tesla_sub: "tesla-b", status: "approved", sessions_valid_after: "-infinity", created_at: "2026-10-02T00:00:00Z" },
    ],
    user_tokens: [
      { user_id: 1, access_token_enc: "enc:a", refresh_token_enc: "enc:ra", expires_at: later(), updated_at: "2026-10-20T00:00:00Z" },
      { user_id: 2, access_token_enc: "enc:b", refresh_token_enc: "enc:rb", expires_at: later(), updated_at: "2026-10-20T00:00:00Z" },
    ],
    // readings_from left out: the window is open from the start (the migration's -infinity).
    vehicles: [
      { user_id: 1, id: "1", vin: "VIN_A", readings_until: null },
      { user_id: 2, id: "2", vin: "VIN_B", readings_until: null },
      { user_id: 1, id: "7", vin: "VIN_S", readings_until: null },
      { user_id: 2, id: "7", vin: "VIN_S", readings_from: B_ADDED, readings_until: null },
    ],
    charging_sessions: [
      { user_id: 1, session_id: "s1", vehicle_vin: "VIN_A" },
      { user_id: 2, session_id: "s2", vehicle_vin: "VIN_B" },
      // The same Supercharger visit of the shared car, in each user's Tesla history.
      { user_id: 1, session_id: "s7", vehicle_vin: "VIN_S" },
      { user_id: 2, session_id: "s7", vehicle_vin: "VIN_S" },
    ],
    stream_charge_sessions: [
      { user_id: 1, id: 10, vin: "VIN_A" },
      { user_id: 2, id: 20, vin: "VIN_B" },
      { user_id: 1, id: 70, vin: "VIN_S" },
      { user_id: 2, id: 71, vin: "VIN_S" },
    ],
    charge_receipts: [
      { user_id: 1, session_id: 10, invoice_path: "10/a.pdf" },
      { user_id: 2, session_id: 20, invoice_path: "20/b.pdf" },
      { user_id: 2, session_id: 71, invoice_path: "71/s.pdf" },
    ],
    // Once per VIN, with no user.
    telemetry_readings: [
      { id: 1, vin: "VIN_A", field: "Soc", created_at: "2026-10-10T00:00:00.000Z", value: 61 },
      { id: 2, vin: "VIN_B", field: "Soc", created_at: "2026-10-10T00:00:00.000Z", value: 62 },
      { id: 3, vin: "VIN_S", field: "Soc", created_at: "2026-10-10T00:00:00.000Z", value: 70 }, // before B added it
      { id: 4, vin: "VIN_S", field: "Soc", created_at: "2026-10-20T00:00:00.000Z", value: 75 },
      // A car nobody tracks (still streaming after an earlier delete).
      { id: 5, vin: "VIN_GONE", field: "Soc", created_at: "2026-10-20T00:00:00.000Z", value: 50 },
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
      { user_id: 1, token_hash: "hash-a" },
      { user_id: 2, token_hash: "hash-b" },
    ],
  });
});

const column = (table: string, name: string) => fake.rows(table).map((r) => r[name]);
const readingIds = () => column("telemetry_readings", "id");
const stopped = () => teslaCalls.filter((c) => c.method === "DELETE").map((c) => c.path.split("/")[4]).sort();
const folded = () => fake.rpcs.filter((r) => r.fn === "fold_signal_days").flatMap((r) => r.args.p_vins as string[]).sort();
const seen = async (owner: Owner, vin: string) => (await loadReadings(owner, vin, "Soc", "2026-01-01T00:00:00Z"))?.map((r) => r.value);

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
    expect(column("vehicles", "display_name")).toEqual([undefined, "B's", undefined, "B's"]);
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
    await readingsBefore(B, "VIN_S", ["Soc"], "infinity");
    expect(fake.rpcs[1].args.p_user_id).toBe(2);
  });
});

describe("streamed readings of a shared car", () => {
  test("each user sees a car's readings only through their own car row, from when they added it", async () => {
    expect(await seen(A, "VIN_S")).toEqual([70, 75]);
    expect(await seen(B, "VIN_S")).toEqual([75]);
    // Never another user's car, nor one nobody tracks.
    expect(await seen(B, "VIN_A")).toEqual([]);
    expect(await seen(A, "VIN_B")).toEqual([]);
    expect(await seen(A, "VIN_GONE")).toEqual([]);
    const reads = fake.calls.filter((c) => c.table === "user_telemetry_readings");
    expect(reads.length).toBe(5);
    for (const read of reads) expect(read.filters.filter((f) => f.startsWith("user_id"))).toHaveLength(1);
  });

  test("a car that left the user's Tesla account stops showing them what it streams next", async () => {
    fake.rows("vehicles")[3].readings_until = "2026-10-19T00:00:00.000Z";
    expect(await seen(B, "VIN_S")).toEqual([]);
    expect(await seen(A, "VIN_S")).toEqual([70, 75]);
  });

  test("a check closes the window of a car Tesla no longer lists, and opens a new one when it's back", async () => {
    const { syncWindows } = await import("@/lib/server/poll");
    // B's Tesla account lists only VIN_B: the shared car left it.
    await syncWindows(B, ["2"], "2026-10-19T00:00:00.000Z");
    expect(fake.rows("vehicles")[3]).toEqual(expect.objectContaining({ readings_from: B_ADDED, readings_until: "2026-10-19T00:00:00.000Z" }));
    expect(fake.rows("vehicles")[1].readings_until).toBeNull();
    expect(await seen(B, "VIN_S")).toEqual([]);
    // A's windows are A's own.
    expect(fake.rows("vehicles")[2].readings_until).toBeNull();
    // Back on 25 Oct: what it streamed while away stays hidden.
    await syncWindows(B, ["2", "7"], "2026-10-25T00:00:00.000Z");
    expect(fake.rows("vehicles")[3]).toEqual(expect.objectContaining({ readings_from: "2026-10-25T00:00:00.000Z", readings_until: null }));
    expect(await seen(B, "VIN_S")).toEqual([]);
    expect(await seen(A, "VIN_S")).toEqual([70, 75]);
  });

  test("readings aren't one user's table: no per-user write or delete can reach them", async () => {
    const { OWNER_TABLES } = await import("@/lib/server/data/owner");
    expect(OWNER_TABLES as readonly string[]).not.toContain("telemetry_readings");
  });
});

describe("account actions touch only the owner's account", () => {
  test("sign out everywhere", async () => {
    await revokeAllSessions(A);
    const [a, b] = fake.rows("users");
    expect(a.sessions_valid_after).not.toBe("-infinity");
    expect(b.sessions_valid_after).toBe("-infinity");
  });

  test("disconnect keeps the token row, empty, and leaves the other user connected and the shared car streaming", async () => {
    await disconnectTesla(A);
    const [a, b] = fake.rows("user_tokens");
    expect(a).toEqual(expect.objectContaining({ user_id: 1, access_token_enc: null, refresh_token_enc: null }));
    expect(b.access_token_enc).toBe("enc:b");
    expect(fake.rows("users")[1].sessions_valid_after).toBe("-infinity");
    expect(await isConnected(A)).toBe(false);
    expect(await isConnected(B)).toBe(true);
    expect(stopped()).toEqual(["VIN_A"]);
  });
});

describe("Delete my data", () => {
  test("deletes the owner's rows and files, and leaves another user's", async () => {
    await eraseOwnerRows(A);
    expect(column("vehicles", "vin")).toEqual(["VIN_B", "VIN_S"]);
    expect(column("charging_sessions", "user_id")).toEqual([2, 2]);
    expect(column("stream_charge_sessions", "id")).toEqual([20, 71]);
    expect(column("charge_receipts", "session_id")).toEqual([20, 71]);
    expect(column("poll_runs", "user_id")).toEqual([2]);
    expect(column("connector_token", "user_id")).toEqual([2]);
    expect(column("user_places", "name")).toEqual(["Cedar Park"]);
    expect(fake.removedFiles).toEqual(["10/a.pdf"]);
    // A's own car's readings go; the shared car keeps what B may see and loses what only A could.
    expect(readingIds()).toEqual([2, 4, 5]);
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
    expect(column("vehicles", "vin")).toEqual(["VIN_B", "VIN_S"]);
  });
});

describe("Delete account with a shared car", () => {
  test("A first: B keeps the car and what B may see; then B: the car's readings all go", async () => {
    await deleteAccount(A);
    expect(fake.rows("users").map((u) => u.id)).toEqual([2]);
    expect(column("vehicles", "user_id")).toEqual([2, 2]);
    // The fake has no cascade, so these are what Delete my data itself removed: nothing of A's is left,
    // and B's copy of the shared car's sessions and invoice stay.
    for (const table of ["charging_sessions", "stream_charge_sessions", "charge_receipts", "poll_runs", "connector_token", "user_places"]) {
      expect(column(table, "user_id").every((id) => id === 2)).toBe(true);
    }
    expect(column("charge_receipts", "session_id")).toEqual([20, 71]);
    expect(fake.rows("user_tokens").find((r) => r.user_id === 2)?.access_token_enc).toBe("enc:b");
    expect(fake.calls.filter((c) => c.table === "users" && c.op === "delete")).toEqual([{ table: "users", op: "delete", filters: ["id = 1"] }]);
    // The shared car keeps streaming for B, and its counts keep its VIN.
    expect(stopped()).toEqual(["VIN_A"]);
    expect(folded()).toEqual(["VIN_A"]);
    expect(readingIds()).toEqual([2, 4, 5]);
    expect(await seen(B, "VIN_S")).toEqual([75]);

    teslaCalls = [];
    fake.rpcs = [];
    await deleteAccount(B);
    expect(fake.rows("users")).toEqual([]);
    expect(fake.rows("vehicles")).toEqual([]);
    expect(stopped()).toEqual(["VIN_B", "VIN_S"]);
    expect(folded()).toEqual(["VIN_B", "VIN_S"]);
    // VIN_GONE was nobody's to delete; the daily sweep takes it.
    expect(readingIds()).toEqual([5]);
  });

  test("B first: A still sees all of the car's readings; then A: they all go", async () => {
    await deleteAccount(B);
    expect(fake.rows("users").map((u) => u.id)).toEqual([1]);
    expect(stopped()).toEqual(["VIN_B"]);
    expect(folded()).toEqual(["VIN_B"]);
    expect(column("charge_receipts", "session_id")).toEqual([10]);
    expect(fake.removedFiles.sort()).toEqual(["20/b.pdf", "71/s.pdf"]);
    expect(readingIds()).toEqual([1, 3, 4, 5]);
    expect(await seen(A, "VIN_S")).toEqual([70, 75]);

    teslaCalls = [];
    fake.rpcs = [];
    await deleteAccount(A);
    expect(stopped()).toEqual(["VIN_A", "VIN_S"]);
    expect(folded()).toEqual(["VIN_A", "VIN_S"]);
    expect(readingIds()).toEqual([5]);
  });

  test("the daily sweep deletes the readings of a car nobody tracks, and only those", async () => {
    const result = await pruneTelemetry();
    expect(result.unseen).toBe(1);
    expect(readingIds()).toEqual([1, 2, 3, 4]);
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

  test("which cars another user tracks, and which nobody does", async () => {
    expect([...(await system.carsOthersTrack(A, ["VIN_A", "VIN_S"]))]).toEqual(["VIN_S"]);
    expect([...(await system.carsOthersTrack(B, ["VIN_B", "VIN_S"]))]).toEqual(["VIN_S"]);
    // A closed window (the car left B's account) doesn't keep it streaming for A's sake.
    fake.rows("vehicles")[3].readings_until = "2026-10-19T00:00:00.000Z";
    expect([...(await system.carsOthersTrack(A, ["VIN_A", "VIN_S"]))]).toEqual([]);
    expect(await system.untrackedCars(["VIN_A", "VIN_GONE"])).toEqual(["VIN_GONE"]);
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
