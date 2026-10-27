import "server-only";
import { matchSessions } from "@/lib/charge-sessions";
import { type PricedCharge, pricedCharges } from "@/lib/charge-tips";
import { loadChargingSessions } from "./charging";
import type { Owner } from "./data/owner";
import { invoicesBySession } from "./receipts";
import { loadStreamSessions } from "./stream-charging";

// Every billed charge the owner has, for the tips on a charge's page and Stats > Battery (lib/charge-tips.ts).
// Empty when the sessions can't be read: the tips then go without prices.
export async function loadPricedCharges(owner: Owner, now: number): Promise<PricedCharge[]> {
  try {
    const [tesla, stream] = await Promise.all([loadChargingSessions(owner), loadStreamSessions(owner)]);
    const invoices = await invoicesBySession(owner, stream.filter((s) => !s.supercharger).map((s) => s.id));
    return pricedCharges(tesla, matchSessions(tesla, stream, now).streamOnly, invoices);
  } catch (err) {
    console.warn("Charge prices unavailable for tips:", (err as Error).message);
    return [];
  }
}
