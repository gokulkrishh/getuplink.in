import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { OwnedRows } from "@/lib/server/data/owned";
import type { Owner } from "@/lib/server/data/owner";

// Two accounts' rows in one database, behind enough of supabase-js for the data layer, so a test can
// tell "the owner's rows" from "every row". Today there is only ever one account; these pin down that
// Delete my data, disconnect and sign out everywhere already act on the owner's own rows, by their keys.

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
// Every query that ran: its table, what it did, and its filters.
let calls: { table: string; op: string; filters: string[] }[];
let removedFiles: string[];
let clients: number;

class Query {
  private op = "select";
  private patch: Row | null = null;
  private rows: Row[] = [];
  private filters: [string, (r: Row) => boolean][] = [];
  constructor(private table: string) {}
  select() {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.op = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([`${column} = ${value}`, (r) => r[column] === value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push([`${column} in (${values.join(",")})`, (r) => values.includes(r[column])]);
    return this;
  }
  not(column: string, op: string, value: unknown) {
    if (op !== "is" || value !== null) throw new Error(`Unexpected not(${column}, ${op})`);
    this.filters.push([`${column} is not null`, (r) => r[column] !== null && r[column] !== undefined]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  private run() {
    calls.push({ table: this.table, op: this.op, filters: this.filters.map(([d]) => d) });
    const all = (tables[this.table] ??= []);
    const hit = (r: Row) => this.filters.every(([, f]) => f(r));
    if (this.op === "insert" || this.op === "upsert") {
      all.push(...this.rows);
      return { data: this.rows, error: null };
    }
    const matched = all.filter(hit);
    if (this.op === "delete") tables[this.table] = all.filter((r) => !hit(r));
    if (this.op === "update") for (const r of matched) Object.assign(r, this.patch);
    return { data: matched.map((r) => ({ ...r })), error: null };
  }
  async maybeSingle() {
    const { data } = this.run();
    return { data: data[0] ?? null, error: null };
  }
  then<T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (err: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({
  db: () => {
    clients++;
    return {
      from: (table: string) => new Query(table),
      storage: { from: () => ({ remove: async (paths: string[]) => (removedFiles.push(...paths), { data: null, error: null }) }) },
    };
  },
}));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

// What the owner has, as ownedRows would find it once each account's rows carry their user. Today
// ownedRows reads every car, since one account owns them all.
const A = { sub: "tesla-a" } as Owner;
let owned: OwnedRows;
mock.module("@/lib/server/data/owned", () => ({ ownedRows: async () => owned }));

// Stopping the stream asks Tesla; nothing here needs it to succeed.
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

const { ownerDb } = await import("@/lib/server/data/owner");
const { eraseOwnerRows } = await import("@/lib/server/data/erase");
const { deleteMyData, disconnectTesla, revokeAllSessions } = await import("@/lib/server/tesla");

beforeEach(() => {
  calls = [];
  removedFiles = [];
  clients = 0;
  tables = {
    oauth_tokens: [
      { provider: "tesla", owner_sub: "tesla-a", access_token_enc: "enc:a", refresh_token_enc: "enc:ra", expires_at: new Date(Date.now() + 3_600_000).toISOString(), sessions_valid_after: "-infinity" },
      { provider: "tesla", owner_sub: "tesla-b", access_token_enc: "enc:b", refresh_token_enc: "enc:rb", expires_at: new Date(Date.now() + 3_600_000).toISOString(), sessions_valid_after: "-infinity" },
    ],
    vehicles: [
      { id: "1", vin: "VIN_A" },
      { id: "2", vin: "VIN_B" },
    ],
    charging_sessions: [
      { session_id: "s1", vehicle_vin: "VIN_A" },
      { session_id: "s2", vehicle_vin: "VIN_B" },
    ],
    stream_charge_sessions: [
      { id: 10, vin: "VIN_A" },
      { id: 20, vin: "VIN_B" },
    ],
    charge_receipts: [
      { session_id: 10, invoice_path: "10/a.pdf" },
      { session_id: 20, invoice_path: "20/b.pdf" },
    ],
    telemetry_readings: [
      { id: 1, vin: "VIN_A", field: "Soc" },
      { id: 2, vin: "VIN_B", field: "Soc" },
      { id: 3, vin: "VIN_GONE", field: "Soc" },
    ],
    poll_runs: [{ id: 1 }],
    connector_token: [{ owner: "tesla", token_hash: "h" }],
  };
  owned = { vehicleIds: ["1"], vins: ["VIN_A"], receipts: [{ session_id: 10, invoice_path: "10/a.pdf" }], unclaimed: false };
});

const vins = (table: string, column = "vin") => (tables[table] ?? []).map((r) => r[column]);

describe("ownerDb", () => {
  test("reaches the database only when a query is built", () => {
    const scope = ownerDb(A);
    scope.from("vehicles");
    expect(clients).toBe(0);
    scope.from("vehicles").select("vin");
    expect(clients).toBe(1);
  });

  test("scopes the account table to the owner on every read, update and delete", async () => {
    const { data } = await ownerDb(A).from("oauth_tokens").select("owner_sub");
    expect(data).toEqual([expect.objectContaining({ owner_sub: "tesla-a" })]);
    await ownerDb(A).from("oauth_tokens").update({ scope: "x" });
    expect(tables.oauth_tokens.map((r) => r.scope)).toEqual(["x", undefined]);
    expect(calls.every((c) => c.filters.includes("owner_sub = tesla-a") && c.filters.includes("provider = tesla"))).toBe(true);
  });

  test("stamps the owner's key on what it writes", async () => {
    await ownerDb(A).from("connector_token").upsert({ token_hash: "new" });
    expect(tables.connector_token.at(-1)).toEqual({ token_hash: "new", owner: "tesla" });
  });
});

describe("account actions touch only the owner's account", () => {
  test("sign out everywhere", async () => {
    await revokeAllSessions(A);
    const [a, b] = tables.oauth_tokens;
    expect(a.sessions_valid_after).not.toBe("-infinity");
    expect(b.sessions_valid_after).toBe("-infinity");
  });

  test("disconnect", async () => {
    await disconnectTesla(A);
    const [a, b] = tables.oauth_tokens;
    expect(a.access_token_enc).toBeNull();
    expect(a.refresh_token_enc).toBeNull();
    expect(b.access_token_enc).toBe("enc:b");
    expect(b.sessions_valid_after).toBe("-infinity");
  });
});

describe("Delete my data", () => {
  test("deletes the owner's rows and files, and leaves another account's", async () => {
    await eraseOwnerRows(A);
    expect(vins("vehicles")).toEqual(["VIN_B"]);
    expect(vins("charging_sessions", "vehicle_vin")).toEqual(["VIN_B"]);
    expect(vins("stream_charge_sessions")).toEqual(["VIN_B"]);
    expect(vins("telemetry_readings")).toEqual(["VIN_B", "VIN_GONE"]);
    expect(vins("charge_receipts", "session_id")).toEqual([20]);
    expect(removedFiles).toEqual(["10/a.pdf"]);
    // With another account, rows that name no owner yet stay.
    expect(tables.poll_runs).toHaveLength(1);
  });

  test("never deletes every row of a table while another account exists", async () => {
    await eraseOwnerRows(A);
    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.length).toBeGreaterThan(0);
    // Each delete is bound by the owner's keys (the connector token by its single-row key until step 3).
    for (const d of deletes) {
      expect(d.filters.some((f) => / in \(/.test(f) || f === "owner = tesla")).toBe(true);
      expect(d.filters.some((f) => f.endsWith("is not null"))).toBe(false);
    }
  });

  test("as the only account, also clears the rows that name no owner", async () => {
    owned = { ...owned, unclaimed: true };
    await eraseOwnerRows(A);
    expect(tables.poll_runs).toEqual([]);
    expect(tables.telemetry_readings).toEqual([]);
    expect(tables.charge_receipts).toEqual([]);
    expect(removedFiles.sort()).toEqual(["10/a.pdf", "20/b.pdf"]);
  });

  test("the whole action keeps the other account signed in and connected", async () => {
    await deleteMyData(A);
    const [a, b] = tables.oauth_tokens;
    expect(a.owner_sub).toBe("tesla-a"); // kept, so nobody else can claim the dashboard
    expect(a.access_token_enc).toBeNull();
    expect(b).toEqual(expect.objectContaining({ owner_sub: "tesla-b", access_token_enc: "enc:b", sessions_valid_after: "-infinity" }));
    expect(vins("vehicles")).toEqual(["VIN_B"]);
  });
});
