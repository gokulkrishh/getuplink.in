import { inSpan, type Slot, type Span, sumBySlot } from "@/lib/periods";

// What charging cost and added in a span, counted the way the Charging page counts it. Pass Tesla's
// sessions and only the streamed sessions Tesla didn't bill (see matchSessions), so none counts twice.

type Billed = { started_at: string; cost_total: number | null; energy_kwh: number | null; currency: string | null };
type Streamed = { started_at: string; energy_added_kwh: number | null };

const within = (span: Span) => (s: { started_at: string }) => inSpan(Date.parse(s.started_at), span);

// When charging tracking began: the first session in any of the lists (billed or streamed), or null.
export function firstStartedAt(...lists: { started_at: string }[][]): number | null {
  let first: number | null = null;
  for (const list of lists) {
    for (const s of list) {
      const at = Date.parse(s.started_at);
      if (Number.isFinite(at) && (first === null || at < first)) first = at;
    }
  }
  return first;
}

const kwh = (value: number | null) => (value && value > 0 ? value : 0);

// Energy per bar, counted like energyIn.
export function energyBySlot(sessions: Billed[], streamOnly: Streamed[], slots: Slot[]): number[] {
  const at = (s: { started_at: string }) => Date.parse(s.started_at);
  const billed = sumBySlot(sessions, slots, at, (s) => kwh(s.energy_kwh));
  const streamed = sumBySlot(streamOnly, slots, at, (s) => kwh(s.energy_added_kwh));
  return billed.map((value, k) => value + streamed[k]);
}

// Tesla's billed kWh for its sessions, the car's own figure for the others.
export function energyIn(sessions: Billed[], streamOnly: Streamed[], span: Span): number {
  return (
    sessions.filter(within(span)).reduce((sum, s) => sum + kwh(s.energy_kwh), 0) +
    streamOnly.filter(within(span)).reduce((sum, s) => sum + kwh(s.energy_added_kwh), 0)
  );
}

// One bill for a charge: Tesla's for a Supercharger, an attached invoice for anything else. kWh is what
// was billed where known, else what the car added.
export type Bill = { started_at: string; cost: number; kwh: number | null; kind: "ac" | "dc" };

// The invoices attached to streamed sessions, by session id (see invoicesBySession).
export type InvoiceAmounts = ReadonlyMap<number, { amount: number; kwhBilled: number | null }>;

// Every real bill, the one way Charging, home and the day page count spend: Tesla's for its sessions, the
// attached invoice for a streamed session Tesla didn't bill. A charge with neither has no bill and is
// never priced.
export function chargingBills(
  sessions: Billed[],
  streamOnly: (Streamed & { id: number; kind: "ac" | "dc" })[],
  invoices: InvoiceAmounts,
): Bill[] {
  return [
    ...sessions.flatMap((s) => (s.cost_total === null ? [] : [{ started_at: s.started_at, cost: s.cost_total, kwh: s.energy_kwh, kind: "dc" as const }])),
    ...streamOnly.flatMap((s) => {
      const invoice = invoices.get(s.id);
      return invoice ? [{ started_at: s.started_at, cost: invoice.amount, kwh: invoice.kwhBilled ?? s.energy_added_kwh, kind: s.kind }] : [];
    }),
  ];
}

// Every charge with its bill, or null when it has none, for counting the unbilled too (see monthlyRows):
// Tesla's sessions and the finished streamed ones Tesla didn't bill, priced as chargingBills prices them.
export function billedCharges(
  sessions: Billed[],
  streamOnly: (Streamed & { id: number; ended_at: string | null })[],
  invoices: InvoiceAmounts,
): { started_at: string; kwh: number | null; cost: number | null }[] {
  return [
    ...sessions.map((s) => ({ started_at: s.started_at, kwh: s.energy_kwh, cost: s.cost_total })),
    ...streamOnly.flatMap((s) => (s.ended_at === null ? [] : [{ started_at: s.started_at, kwh: s.energy_added_kwh, cost: invoices.get(s.id)?.amount ?? null }])),
  ];
}

// Spend, energy billed and ₹/kWh by charger kind in a span, from real bills only.
export function billsIn(bills: Bill[], span: Span) {
  const inside = bills.filter(within(span));
  const sum = (list: Bill[], f: (b: Bill) => number) => list.reduce((a, b) => a + f(b), 0);
  const perKwh = (list: Bill[]) => {
    const priced = list.filter((b) => b.kwh !== null && b.kwh > 0);
    const kwh = sum(priced, (b) => b.kwh!);
    return kwh > 0 ? sum(priced, (b) => b.cost) / kwh : null;
  };
  return {
    cost: sum(inside, (b) => b.cost),
    kwh: sum(inside, (b) => b.kwh ?? 0),
    count: inside.length,
    acPerKwh: perKwh(inside.filter((b) => b.kind === "ac")),
    dcPerKwh: perKwh(inside.filter((b) => b.kind === "dc")),
  };
}

// Spend per bar from real bills.
export function billsBySlot(bills: Bill[], slots: Slot[]): number[] {
  return sumBySlot(bills, slots, (b) => Date.parse(b.started_at), (b) => b.cost);
}

// A list of charges added up, for one day: energy added, null when any charge has no figure (so a total
// never leaves one out), and what the bills came to, with how many charges had no bill. Spend counts real
// bills only, so a charge with none is counted apart, never as ₹0.
export function chargeTotals(charges: { kwh: number | null; cost: number | null }[]): { kwh: number | null; cost: number; unbilled: number } {
  return {
    kwh: charges.some((c) => c.kwh === null) ? null : charges.reduce((sum, c) => sum + (c.kwh ?? 0), 0),
    cost: charges.reduce((sum, c) => sum + (c.cost ?? 0), 0),
    unbilled: charges.filter((c) => c.cost === null).length,
  };
}
