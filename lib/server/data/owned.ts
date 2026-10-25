import "server-only";
import { readAllRows } from "@/lib/paging";
import { type Owner, ownerDb } from "./owner";
import { accountCount } from "./system";

const MISSING_TABLE = ["42P01", "PGRST205"];
// The ids go in the URL, so a long list is read in chunks.
const IDS_PER_READ = 200;

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
  // The cars' streamed sessions, then the invoices on them. Two plain reads rather than an embed, which
  // PostgREST refuses once the users migration adds a second key between the tables.
  const sessions = vins.length ? await readAllRows((from, to) => scope.from("stream_charge_sessions").select("id").in("vin", vins).order("id").range(from, to)) : { data: [], error: null };
  if (sessions.error && !MISSING_TABLE.includes(sessions.error.code)) throw new Error(`Reading your charging sessions failed: ${sessions.error.message}`);
  const ids = (sessions.data ?? []).map((s) => Number(s.id));
  const receipts: OwnedRows["receipts"] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const read = await scope.from("charge_receipts").select("session_id, invoice_path").in("session_id", ids.slice(i, i + IDS_PER_READ));
    if (read.error) {
      if (MISSING_TABLE.includes(read.error.code)) break;
      throw new Error(`Reading invoices failed: ${read.error.message}`);
    }
    for (const r of read.data as { session_id: number; invoice_path: string | null }[]) receipts.push({ session_id: Number(r.session_id), invoice_path: r.invoice_path });
  }
  return { vehicleIds, vins, receipts, unclaimed: (await accountCount()) <= 1 };
}
