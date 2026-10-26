// Matches a third-party charging invoice to the session it was for. Pure (no database), so the rules
// are tested directly; the connector reads the sessions and writes the receipt.

const MIN = 60_000;
const DAY = 86_400_000;

// The invoice's start may differ from the car's: the charger's clock, authorising before current flows.
export const START_WITHIN_MS = 20 * MIN;
// A session picked by hand still has to be near the invoice: same evening, not another day.
const PICKED_WITHIN_MS = 2 * 60 * MIN;
// The charger meters before the car's losses, so billed kWh runs a little over what the battery
// gained; AC loses more on the way than DC.
const KWH_RATIO = { ac: [0.95, 1.3], dc: [0.95, 1.15] } as const;
// Invoices older than this aren't accepted: the car's sessions only go back so far, and an old
// invoice is more likely a mistake than a late one.
export const MAX_AGE_MS = 60 * DAY;
const MAX_KWH = 150;
const MAX_AMOUNT = 100_000;

export type Invoice = {
  network: string;
  station?: string | null;
  startedAt: number;
  endedAt?: number | null;
  kwhBilled?: number | null;
  amountTotal: number;
  gst?: number | null;
  energyAmount?: number | null; // the energy line before GST, as printed
};

export type ReceiptSession = {
  id: number;
  started_at: string;
  ended_at: string | null;
  kind: "ac" | "dc";
  supercharger: boolean;
  energy_added_kwh: number | null;
  station_name: string | null; // "Operator, Area", or a bare name or operator (lib/stations.ts)
};

export type MatchResult =
  | { kind: "match"; session: ReceiptSession }
  | { kind: "ambiguous"; candidates: ReceiptSession[] }
  | { kind: "none" };

// What's wrong with the invoice's own fields, or null when they're usable.
export function invoiceProblem(inv: Invoice, now: number): string | null {
  if (!inv.network.trim()) return "The invoice has no network name.";
  if (!Number.isFinite(inv.startedAt)) return "The invoice has no start time.";
  if (inv.startedAt > now + 5 * MIN) return "The invoice starts in the future.";
  if (inv.startedAt < now - MAX_AGE_MS) return "The invoice is more than 60 days old.";
  if (inv.endedAt != null && !(inv.endedAt >= inv.startedAt)) return "The invoice ends before it starts.";
  if (!(inv.amountTotal > 0 && inv.amountTotal <= MAX_AMOUNT)) return "The amount isn't between ₹0 and ₹1,00,000.";
  if (inv.gst != null && !(inv.gst >= 0 && inv.gst < inv.amountTotal)) return "The GST isn't less than the amount.";
  if (inv.energyAmount != null && !(inv.energyAmount > 0 && inv.energyAmount + (inv.gst ?? 0) <= inv.amountTotal + 0.005)) {
    return "The energy amount plus GST is more than the total.";
  }
  if (inv.kwhBilled != null && !(inv.kwhBilled > 0 && inv.kwhBilled <= MAX_KWH)) return "The kWh billed isn't between 0 and 150.";
  return null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Whether the session's station is the invoice's network: true or false when the label names an
// operator ("Operator, Area"), null when it doesn't say (no station, or a bare name).
export function sameOperator(network: string, stationName: string | null): boolean | null {
  if (!stationName?.includes(",")) return null;
  const [operator, net] = [squash(stationName.split(",")[0]), squash(network)];
  if (!operator || !net) return null;
  return operator.includes(net) || net.includes(operator);
}

// Whether billed kWh fits what the car added, or null when either is missing.
function energyFits(inv: Invoice, s: ReceiptSession): boolean | null {
  const added = s.energy_added_kwh == null ? null : Number(s.energy_added_kwh);
  if (inv.kwhBilled == null || !added) return null;
  const [lo, hi] = KWH_RATIO[s.kind];
  const ratio = inv.kwhBilled / added;
  return ratio >= lo && ratio <= hi;
}

function timeFits(inv: Invoice, s: ReceiptSession, within: number): boolean {
  const start = Date.parse(s.started_at);
  const end = Date.parse(s.ended_at!);
  if (Math.abs(inv.startedAt - start) <= within) return true;
  return inv.endedAt != null && inv.startedAt < end && inv.endedAt > start;
}

// A finished third-party session the invoice could be for: time, energy and operator all agree, or
// say nothing. Superchargers have Tesla's own invoices.
function fits(inv: Invoice, s: ReceiptSession, within: number): boolean {
  if (s.supercharger || s.ended_at == null) return false;
  return timeFits(inv, s, within) && energyFits(inv, s) !== false && sameOperator(inv.network, s.station_name) !== false;
}

// The one session the invoice is for. Several that fit narrow to those whose station names the
// network; anything else is left for the owner to pick, never guessed.
export function matchInvoice(inv: Invoice, sessions: ReceiptSession[]): MatchResult {
  const fitting = sessions.filter((s) => fits(inv, s, START_WITHIN_MS));
  if (fitting.length === 1) return { kind: "match", session: fitting[0] };
  if (fitting.length === 0) return { kind: "none" };
  const named = fitting.filter((s) => sameOperator(inv.network, s.station_name) === true);
  return named.length === 1 ? { kind: "match", session: named[0] } : { kind: "ambiguous", candidates: fitting };
}

// Checks a session the owner picked: the same rules, with a wider time window.
export function pickedSessionFits(inv: Invoice, s: ReceiptSession): boolean {
  return fits(inv, s, PICKED_WITHIN_MS);
}
