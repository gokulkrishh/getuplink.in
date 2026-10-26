import "server-only";
import { readAllRows } from "@/lib/paging";
import { type Owner, ownerDb } from "./owner";

const MISSING_TABLE = ["42P01", "PGRST205"];

export type OwnedRows = {
  vehicleIds: string[];
  vins: string[];
  // The owner's invoices: their session ids and stored files.
  receipts: { session_id: number; invoice_path: string | null }[];
};

// The keys of everything an owner has, for Delete my data. Every read is the owner's own rows (user_id,
// see ownerKeys), so another account's rows can't go with them.
export async function ownedRows(owner: Owner): Promise<OwnedRows> {
  const scope = ownerDb(owner);
  const { data: cars, error } = await scope.from("vehicles").select("id:id::text, vin");
  if (error) throw new Error(`Reading your cars failed: ${error.message}`);
  const vehicleIds = (cars ?? []).map((c) => c.id as string);
  const vins = (cars ?? []).flatMap((c) => (c.vin ? [c.vin as string] : []));
  // Every invoice of the owner's, including one on a session whose car row is gone.
  const read = await readAllRows((from, to) => scope.from("charge_receipts").select("session_id, invoice_path").order("session_id").range(from, to));
  if (read.error && !MISSING_TABLE.includes(read.error.code)) throw new Error(`Reading invoices failed: ${read.error.message}`);
  const receipts = ((read.data ?? []) as { session_id: number; invoice_path: string | null }[]).map((r) => ({ session_id: Number(r.session_id), invoice_path: r.invoice_path }));
  return { vehicleIds, vins, receipts };
}
