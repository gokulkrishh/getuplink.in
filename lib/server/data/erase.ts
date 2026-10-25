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

// Delete my data's database half (lib/server/tesla.ts stops streaming first and forgets the tokens after):
// the owner's invoices and their files, the connector token, the cars (which cascade to snapshots and
// version history), their charging sessions and streamed readings. Everything goes by the owner's own keys
// (see ownedRows). Release notes and place names are shared, not the owner's.
export async function eraseOwnerRows(owner: Owner): Promise<void> {
  const scope = ownerDb(owner);
  const keys = await ownedRows(owner);

  // Invoices point at the charging sessions, which can't go while one does.
  const paths = keys.receipts.flatMap((r) => (r.invoice_path ? [r.invoice_path] : []));
  if (paths.length) await scope.invoices().remove(paths);
  await deleteIn(owner, "charge_receipts", "session_id", keys.receipts.map((r) => r.session_id), true);

  const token = await scope.from("connector_token").delete();
  if (token.error && !MISSING_TABLE.includes(token.error.code)) throw new Error(`Revoking the connector token failed: ${token.error.message}`);

  await deleteIn(owner, "vehicles", "id", keys.vehicleIds);
  await deleteIn(owner, "charging_sessions", "vehicle_vin", keys.vins, true);
  await deleteIn(owner, "stream_charge_sessions", "vin", keys.vins, true);
  await deleteIn(owner, "telemetry_readings", "vin", keys.vins);

  // Only while no other account exists: the check log, and rows for a VIN no car row names any more (a
  // car removed from the account, streaming that didn't stop after an earlier delete). Invoices first.
  if (keys.unclaimed) {
    const left = await scope.from("charge_receipts").select("invoice_path");
    if (left.error && !MISSING_TABLE.includes(left.error.code)) throw new Error(`Reading invoices failed: ${left.error.message}`);
    const files = ((left.data ?? []) as { invoice_path: string | null }[]).flatMap((r) => (r.invoice_path ? [r.invoice_path] : []));
    if (files.length) await scope.invoices().remove(files);
    for (const [table, column] of [
      ["charge_receipts", "session_id"],
      ["charging_sessions", "session_id"],
      ["stream_charge_sessions", "vin"],
      ["telemetry_readings", "vin"],
      ["poll_runs", "id"],
    ] as const) {
      const { error } = await scope.from(table).delete().not(column, "is", null);
      const optional = table === "charge_receipts" || table === "charging_sessions" || table === "stream_charge_sessions";
      if (error && !(optional && MISSING_TABLE.includes(error.code))) throw new Error(`Deleting ${table} failed: ${error.message}`);
    }
  }
}
