import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/server/supabase";
import type { Shown } from "@/lib/view-links";

// The data layer: the only code that talks to the database (test/data-layer-guard.test.ts fails on any
// other import of the client). Per-user reads and writes go through ownerDb(owner) below; fleet-wide ones
// (rollout, admin, status, crons) through the named functions in ./system.ts.

declare const OWNER: unique symbol;

// The signed-in account a read or write is for: its users row and its Tesla account id (id_token `sub`).
// Plain data, since it crosses "use cache: private" scopes; the brand is type-only, so only
// lib/server/auth.ts and ./system.ts make one (with asOwner).
// viewOnly: someone the owner sent a view link (lib/server/view-links.ts) reads this account, read-only.
// Only currentReader() makes one (with asViewer): it reads like the owner, but every write refuses it (see
// ownerTable), and loaders leave out what would ask Tesla, Google, OpenStreetMap or the AI.
// hidden: what the viewer's link leaves out (Settings → View links). Never set on the owner's own Owner.
export type Owner = { readonly userId: number; readonly sub: string; readonly viewOnly?: true; readonly hidden?: readonly Hidden[]; readonly [OWNER]: true };

// What a view link can leave out: where the car goes, parks and charges. (Invoices are never a viewer's,
// whatever the link says: see showsInvoices.)
export type Hidden = "locations";

export const asOwner = (userId: number, sub: string): Owner => ({ userId, sub }) as Owner;
export const asViewer = (userId: number, sub: string, hidden: readonly Hidden[] = []): Owner =>
  (hidden.length > 0 ? { userId, sub, viewOnly: true, hidden: [...hidden] } : { userId, sub, viewOnly: true }) as Owner;

// Whether this reader's link leaves `what` out. The one check every loader uses: a hidden value is left out
// where it is read, on the server, so it never reaches the page (nor the browser with it).
export const hides = (owner: Owner, what: Hidden): boolean => owner.hidden?.includes(what) === true;

// Whether this reader sees charging invoices and receipts (their number, lines, station and file): the owner
// only. A view link never does, whatever it hides.
export const showsInvoices = (owner: Owner): boolean => owner.viewOnly !== true;

// The same, as the flags a page draws by: leave out a map rather than show it empty, and say "Hidden".
export const shownTo = (owner: Owner): Shown => ({ locations: !hides(owner, "locations") });

// The car's readings that say where it is or is going. Left out of every reading for a link that hides locations.
export const LOCATION_FIELDS = [
  "Location",
  "LocatedAtHome",
  "LocatedAtWork",
  "LocatedAtFavorite",
  "DestinationLocation",
  "DestinationName",
  "OriginLocation",
  "RouteLine",
  "RouteLastUpdated",
  "GpsHeading",
  "GpsState",
  "GpsAccuracyMeters",
];

// The fields asked for, less the location ones when this reader's link hides them.
export const readableFields = (owner: Owner, fields: string[]): string[] => (hides(owner, "locations") ? fields.filter((f) => !LOCATION_FIELDS.includes(f)) : fields);

// Writes, and invoice files, are the owner's alone. A view-only reader reaching one is a bug: it throws
// rather than writes or reads.
export class ViewOnlyWrite extends Error {
  constructor() {
    super("A view link can't change anything or read an invoice");
  }
}
function writable(owner: Owner): void {
  if (owner.viewOnly) throw new ViewOnlyWrite();
}

// Demo mode signs everyone in as this account; db() refuses to run, so it never reaches the database.
export const DEMO_OWNER = asOwner(0, "demo");

// Every table that holds one account's rows. Each has a user_id column. Streamed readings aren't one
// account's: they are stored once per car (VIN) and read through readings() below.
export const OWNER_TABLES = [
  "user_tokens",
  "connector_token",
  "vehicles",
  "snapshots",
  "version_history",
  "poll_runs",
  "charging_sessions",
  "stream_charge_sessions",
  "charge_receipts",
  "user_places",
  "drive_wording",
  "feedback",
  "tip_votes",
  "fleet_car_days",
] as const;
export type OwnerTable = (typeof OWNER_TABLES)[number];

// Which rows of a table are the owner's, as column = value, applied to every select, update and delete
// and stamped on every insert and upsert: user_id = the owner's user, on every table. This is the one
// place that says so.
export function ownerKeys(_table: OwnerTable, owner: Owner): Record<string, number> {
  return { user_id: owner.userId };
}

type Builder = ReturnType<SupabaseClient["from"]>;
type Filterable = { eq(column: string, value: unknown): Filterable };
export type OwnerQuery = Pick<Builder, "select" | "insert" | "upsert" | "update" | "delete">;

function where<T>(query: T, keys: Record<string, number>): T {
  let q = query as unknown as Filterable;
  for (const [column, value] of Object.entries(keys)) q = q.eq(column, value);
  return q as unknown as T;
}

function stamp<T>(values: T, keys: Record<string, number>): T {
  if (Object.keys(keys).length === 0) return values;
  return (Array.isArray(values) ? values.map((v) => ({ ...v, ...keys })) : { ...(values as object), ...keys }) as T;
}

function ownerTable(table: OwnerTable, owner: Owner): OwnerQuery {
  const keys = ownerKeys(table, owner);
  // db() runs when a query is built, never before: a loader's demo branch can hold an ownerDb.
  const from = () => db().from(table);
  return {
    select: ((...args: Parameters<Builder["select"]>) => where(from().select(...args), keys)) as Builder["select"],
    update: ((values: Record<string, unknown>, options?: Parameters<Builder["update"]>[1]) => (writable(owner), where(from().update(values, options), keys))) as Builder["update"],
    delete: ((...args: Parameters<Builder["delete"]>) => (writable(owner), where(from().delete(...args), keys))) as Builder["delete"],
    insert: ((values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<Builder["insert"]>[1]) =>
      (writable(owner), from().insert(stamp(values, keys), options))) as Builder["insert"],
    upsert: ((values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<Builder["upsert"]>[1]) =>
      (writable(owner), from().upsert(stamp(values, keys), options))) as Builder["upsert"],
  };
}

// Database functions that read one user's rows: the p_user_id overloads from the users migration, called
// with the owner's user.
export type OwnerRpc = "counter_values_at" | "snapshot_odometer_at";

// Invoice files for the owner's charging sessions (the private charge-invoices bucket).
export const INVOICE_BUCKET = "charge-invoices";

// Streamed readings the owner may see. The Fly receiver stores each reading once per VIN, whoever tracks
// the car; the view user_telemetry_readings (20261102120000_shared_cars.sql) pairs them with each user's
// car row and keeps only those inside that user's window (vehicles.readings_from .. readings_until). So a
// user sees only cars they track, and only from when they began tracking: a second user of a shared car
// never sees the time before they added it. Select only: readings are deleted by VIN, once nobody may see
// them (forgetUnseenReadings in ./system.ts).
const READINGS_VIEW = "user_telemetry_readings";

// Drives kept past the readings' retention (20261112120000_drive_archive.sql), stored once per VIN like the
// readings and read through the same window: the view user_drive_archive keeps each user's drives that
// started while they tracked the car. Select only: lib/server/drive-archive.ts writes through ./system.ts.
const DRIVE_ARCHIVE_VIEW = "user_drive_archive";

// The one way to read or write an account's rows. Every query it builds is filtered to the owner (see
// ownerKeys), so a caller can't forget to.
export function ownerDb(owner: Owner) {
  return {
    owner,
    from: (table: OwnerTable) => ownerTable(table, owner),
    // A link that hides locations never gets a location reading back, whatever the caller asked for.
    readings: ((...args: Parameters<Builder["select"]>) => {
      const q = where(db().from(READINGS_VIEW).select(...args), { user_id: owner.userId });
      return hides(owner, "locations") ? q.not("field", "in", `(${LOCATION_FIELDS.map((f) => `"${f}"`).join(",")})`) : q;
    }) as Builder["select"],
    archivedDrives: ((...args: Parameters<Builder["select"]>) =>
      where(db().from(DRIVE_ARCHIVE_VIEW).select(...args), { user_id: owner.userId })) as Builder["select"],
    rpc: (fn: OwnerRpc, args: Record<string, unknown>) =>
      db().rpc(fn, { ...args, ...(Array.isArray(args.p_fields) ? { p_fields: readableFields(owner, args.p_fields as string[]) } : {}), p_user_id: owner.userId }),
    // Invoices are the owner's alone: a guest (a view link) can't download one, get a signed URL to one,
    // list them, upload or remove. Any call on the bucket throws for a guest, before reaching storage.
    invoices: () => {
      const bucket = db().storage.from(INVOICE_BUCKET);
      if (!owner.viewOnly) return bucket;
      return new Proxy(bucket, {
        get: (_target, key) => (typeof key === "string" ? () => writable(owner) : undefined),
      });
    },
  };
}

export type OwnerDb = ReturnType<typeof ownerDb>;
