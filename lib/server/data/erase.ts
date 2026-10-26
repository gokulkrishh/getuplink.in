import "server-only";
import { ownedRows } from "./owned";
import { type Owner, ownerDb, type OwnerTable } from "./owner";

// Postgres 42P01 / PostgREST PGRST205: a table whose migration never ran, so there is nothing to delete.
const MISSING_TABLE = ["42P01", "PGRST205"];
// The keys go in the URL, so long lists are deleted in chunks.
const KEYS_PER_DELETE = 200;

async function deleteIn(owner: Owner, table: OwnerTable, column: string, keys: (string | number)[], optional = false) {
  for (let i = 0; i < keys.length; i += KEYS_PER_DELETE) {
    const { error } = await ownerDb(owner).from(table).delete().in(column, keys.slice(i, i + KEYS_PER_DELETE));
    if (error && !(optional && MISSING_TABLE.includes(error.code))) throw new Error(`Deleting ${table} failed: ${error.message}`);
  }
}

// The rest of a table's rows of the owner's (ownerDb filters every delete to user_id).
async function deleteRest(owner: Owner, table: OwnerTable, optional = false) {
  const { error } = await ownerDb(owner).from(table).delete();
  if (error && !(optional && MISSING_TABLE.includes(error.code))) throw new Error(`Deleting ${table} failed: ${error.message}`);
}

// Delete my data's database half (lib/server/tesla.ts stops streaming first and forgets the tokens after):
// the owner's invoices and their files, the connector token, the cars (which cascade to snapshots and
// version history), their charging sessions, streamed readings and check log. Every delete is the owner's
// own rows (user_id, see ownerKeys), so another account's can't go with them. Release notes and place
// names are shared, not the owner's.
export async function eraseOwnerRows(owner: Owner): Promise<void> {
  const scope = ownerDb(owner);
  const keys = await ownedRows(owner);

  // Invoices point at the charging sessions, which can't go while one does.
  const paths = keys.receipts.flatMap((r) => (r.invoice_path ? [r.invoice_path] : []));
  if (paths.length) await scope.invoices().remove(paths);
  await deleteRest(owner, "charge_receipts", true);

  const token = await scope.from("connector_token").delete();
  if (token.error && !MISSING_TABLE.includes(token.error.code)) throw new Error(`Revoking the connector token failed: ${token.error.message}`);

  await deleteIn(owner, "vehicles", "id", keys.vehicleIds);
  await deleteRest(owner, "charging_sessions", true);
  await deleteRest(owner, "stream_charge_sessions", true);
  // Readings by VIN first, which the (vin, field, created_at) index serves; then any left under the owner
  // for a VIN no car row names any more (streaming that didn't stop after an earlier delete).
  await deleteIn(owner, "telemetry_readings", "vin", keys.vins);
  await deleteRest(owner, "telemetry_readings");
  await deleteRest(owner, "poll_runs");
  // The owner's names for places; optional, since the table may not exist yet.
  await deleteRest(owner, "user_places", true);
}
