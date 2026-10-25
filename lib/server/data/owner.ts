import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/server/supabase";

// The data layer: the only code that talks to the database (test/data-layer-guard.test.ts fails on any
// other import of the client). Per-user reads and writes go through ownerDb(owner) below; fleet-wide ones
// (rollout, admin, status, crons) through the named functions in ./system.ts.

declare const OWNER: unique symbol;

// The signed-in account a read or write is for. Plain data, since it crosses "use cache: private"
// scopes; the brand is type-only, so only lib/server/auth.ts and ./system.ts make one (with asOwner).
// The Tesla account id (id_token `sub`) is the identity until the users table (step 2) adds a user id.
export type Owner = { readonly sub: string; readonly [OWNER]: true };

export const asOwner = (sub: string): Owner => ({ sub }) as Owner;

// Demo mode signs everyone in as this account; db() refuses to run, so it never reaches the database.
export const DEMO_OWNER = asOwner("demo");

// Every table that holds one account's rows.
export const OWNER_TABLES = [
  "oauth_tokens",
  "connector_token",
  "vehicles",
  "snapshots",
  "version_history",
  "poll_runs",
  "charging_sessions",
  "stream_charge_sessions",
  "charge_receipts",
  "telemetry_readings",
] as const;
export type OwnerTable = (typeof OWNER_TABLES)[number];

// Which rows of a table are the owner's, as column = value, applied to every select, update and delete
// and stamped on every insert and upsert. Today the account tables hold one row, keyed as below, and the
// car tables hold only the one account's cars, so they need no key. Step 3 (docs/signup-plan.md) replaces
// this with user_id = the owner's user on every table, here and nowhere else.
export function ownerKeys(table: OwnerTable, owner: Owner): Record<string, string> {
  switch (table) {
    case "oauth_tokens":
      return { provider: "tesla", owner_sub: owner.sub };
    case "connector_token":
      return { owner: "tesla" };
    default:
      return {};
  }
}

type Builder = ReturnType<SupabaseClient["from"]>;
type Filterable = { eq(column: string, value: unknown): Filterable };
export type OwnerQuery = Pick<Builder, "select" | "insert" | "upsert" | "update" | "delete">;

function where<T>(query: T, keys: Record<string, string>): T {
  let q = query as unknown as Filterable;
  for (const [column, value] of Object.entries(keys)) q = q.eq(column, value);
  return q as unknown as T;
}

function stamp<T>(values: T, keys: Record<string, string>): T {
  if (Object.keys(keys).length === 0) return values;
  return (Array.isArray(values) ? values.map((v) => ({ ...v, ...keys })) : { ...(values as object), ...keys }) as T;
}

function ownerTable(table: OwnerTable, owner: Owner): OwnerQuery {
  const keys = ownerKeys(table, owner);
  // db() runs when a query is built, never before: a loader's demo branch can hold an ownerDb.
  const from = () => db().from(table);
  return {
    select: ((...args: Parameters<Builder["select"]>) => where(from().select(...args), keys)) as Builder["select"],
    update: ((values: Record<string, unknown>, options?: Parameters<Builder["update"]>[1]) => where(from().update(values, options), keys)) as Builder["update"],
    delete: ((...args: Parameters<Builder["delete"]>) => where(from().delete(...args), keys)) as Builder["delete"],
    insert: ((values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<Builder["insert"]>[1]) =>
      from().insert(stamp(values, keys), options)) as Builder["insert"],
    upsert: ((values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<Builder["upsert"]>[1]) =>
      from().upsert(stamp(values, keys), options)) as Builder["upsert"],
  };
}

// Database functions that read one car's rows. snapshot_odometer_at reads every car's snapshots, which is
// the owner's with one account; step 3 moves both to the user-aware overloads from the step 2 migration.
export type OwnerRpc = "counter_values_at" | "snapshot_odometer_at";

// Invoice files for the owner's charging sessions (the private charge-invoices bucket).
export const INVOICE_BUCKET = "charge-invoices";

// The one way to read or write an account's rows. Every query it builds is filtered to the owner (see
// ownerKeys), so a caller can't forget to.
export function ownerDb(owner: Owner) {
  return {
    owner,
    from: (table: OwnerTable) => ownerTable(table, owner),
    rpc: (fn: OwnerRpc, args: Record<string, unknown>) => db().rpc(fn, args),
    invoices: () => db().storage.from(INVOICE_BUCKET),
  };
}

export type OwnerDb = ReturnType<typeof ownerDb>;
