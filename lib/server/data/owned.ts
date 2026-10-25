import "server-only";
import { type Owner, ownerDb } from "./owner";
import { accountCount } from "./system";

const MISSING_TABLE = ["42P01", "PGRST205"];

export type OwnedRows = {
  vehicleIds: string[];
  vins: string[];
  // The owner's invoices: their session ids and stored files.
  receipts: { session_id: number; invoice_path: string | null }[];
  // Rows that name no car or account yet (streamed readings for a VIN with no car row, the check log) are
  // this owner's only while there is no other account. Step 3's user_id ends this.
  unclaimed: boolean;
};

// The keys of everything an owner has, for Delete my data. Every delete it does is by these keys, never
// "every row", so another account's rows can't go with it. With one account, the owner's cars are every car.
export async function ownedRows(owner: Owner): Promise<OwnedRows> {
  const scope = ownerDb(owner);
  const { data: cars, error } = await scope.from("vehicles").select("id:id::text, vin");
  if (error) throw new Error(`Reading your cars failed: ${error.message}`);
  const vehicleIds = (cars ?? []).map((c) => c.id as string);
  const vins = (cars ?? []).flatMap((c) => (c.vin ? [c.vin as string] : []));
  let receipts: OwnedRows["receipts"] = [];
  if (vins.length > 0) {
    const read = await scope
      .from("charge_receipts")
      .select("session_id, invoice_path, stream_charge_sessions!inner(vin)")
      .in("stream_charge_sessions.vin", vins);
    if (read.error && !MISSING_TABLE.includes(read.error.code)) throw new Error(`Reading invoices failed: ${read.error.message}`);
    receipts = ((read.data ?? []) as { session_id: number; invoice_path: string | null }[]).map((r) => ({ session_id: Number(r.session_id), invoice_path: r.invoice_path }));
  }
  return { vehicleIds, vins, receipts, unclaimed: (await accountCount()) <= 1 };
}
