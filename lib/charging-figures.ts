import { type InvoiceLine, KIND_LABELS, paise } from "@/lib/invoice-items";
import { inSpan, type Slot, type Span, sumBySlot } from "@/lib/periods";

// What charging cost and added in a span, counted the way the Charging page counts it. Pass Tesla's
// sessions and only the streamed sessions Tesla didn't bill (see matchSessions), so none counts twice.

// lines: Tesla's fee lines when they add up to cost_total (see billLines), else the bill isn't itemised.
type Billed = { started_at: string; cost_total: number | null; energy_kwh: number | null; currency: string | null; lines?: { type: string; amount: number }[] | null };
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
// was billed where known, else what the car added. parts: what the amount was for, adding up to cost,
// when the bill says (see billParts); null or missing when it doesn't.
export type Bill = { started_at: string; cost: number; kwh: number | null; kind: "ac" | "dc"; parts?: BillPart[] | null };

// One line of a bill. "supercharger" lines are Tesla's fee types as it bills them; "invoice" lines are
// from an attached invoice: energy and fees before GST, and the GST.
export type BillPart = { from: "supercharger" | "invoice"; label: string; amount: number };

// The invoices attached to streamed sessions, by session id (see invoicesBySession). gst and
// energyAmount are as printed, null when the invoice didn't say; lines are the invoice's own, as sent with
// the invoice, when they add up (lib/invoice-items.ts storedLines).
type InvoiceAmount = { amount: number; kwhBilled: number | null; gst?: number | null; energyAmount?: number | null; lines?: readonly InvoiceLine[] | null };
export type InvoiceAmounts = ReadonlyMap<number, InvoiceAmount>;

// An invoice's parts. With its own lines, one part per line, named by kind (Energy, Fees, Idle fees,
// Parking, Discounts, GST, Other) so the same charge adds up across networks. Otherwise energy, fees and
// GST when it prints both the energy line and the GST; before GST and GST when it only prints the GST.
// Anything less isn't split: the rest could be fees or tax.
export function invoiceParts(invoice: Omit<InvoiceAmount, "kwhBilled">): BillPart[] | null {
  const { amount, gst, energyAmount, lines } = invoice;
  const part = (label: string, value: number): BillPart => ({ from: "invoice", label, amount: value });
  if (lines?.length && lines.reduce((sum, l) => sum + paise(l.amount), 0) === paise(amount)) {
    return lines.map((l) => part(KIND_LABELS[l.kind], l.amount));
  }
  if (gst == null || !(gst >= 0) || paise(gst) > paise(amount)) return null;
  if (energyAmount != null && energyAmount > 0 && paise(energyAmount) + paise(gst) <= paise(amount)) {
    const fees = (paise(amount) - paise(energyAmount) - paise(gst)) / 100;
    return [part("Energy", energyAmount), ...(fees > 0 ? [part("Fees", fees)] : []), part("GST", gst)];
  }
  return [part("Before GST", (paise(amount) - paise(gst)) / 100), part("GST", gst)];
}

// A bill with its parts only when it has some, so an unitemised bill is the plain bill.
const withParts = (bill: Bill, parts: BillPart[] | null | undefined): Bill => (parts?.length ? { ...bill, parts } : bill);

// Every real bill, the one way Charging, home and the day page count spend: Tesla's for its sessions, the
// attached invoice for a streamed session Tesla didn't bill. A charge with neither has no bill and is
// never priced.
export function chargingBills(
  sessions: Billed[],
  streamOnly: (Streamed & { id: number; kind: "ac" | "dc" })[],
  invoices: InvoiceAmounts,
): Bill[] {
  return [
    ...sessions.flatMap((s): Bill[] =>
      s.cost_total === null
        ? []
        : [withParts({ started_at: s.started_at, cost: s.cost_total, kwh: s.energy_kwh, kind: "dc" }, s.lines?.map((l) => ({ from: "supercharger", label: l.type, amount: l.amount })))],
    ),
    ...streamOnly.flatMap((s): Bill[] => {
      const invoice = invoices.get(s.id);
      return invoice ? [withParts({ started_at: s.started_at, cost: invoice.amount, kwh: invoice.kwhBilled ?? s.energy_added_kwh, kind: s.kind }, invoiceParts(invoice))] : [];
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

// What the bills in a span were for: Supercharger lines and invoice lines, each label added up, with
// what wasn't itemised apart. Summed in paise, so the lines add up to the total exactly. Null when no
// bill in the span is itemised (a list of one "Not itemised" line says nothing).
export type SpendBreakdown = {
  supercharger: { label: string; amount: number }[];
  invoice: { label: string; amount: number }[];
  unitemised: number;
  total: number;
};

// Charges, then discounts, then tax.
const INVOICE_ORDER = ["Energy", "Fees", "Idle fees", "Parking", "Other", "Before GST", "Discounts", "GST"];

export function spendBreakdown(bills: Bill[], span: Span): SpendBreakdown | null {
  const inside = bills.filter(within(span));
  if (!inside.some((b) => b.parts?.length)) return null;
  const sums = { supercharger: new Map<string, number>(), invoice: new Map<string, number>() };
  let unitemised = 0;
  let total = 0;
  for (const b of inside) {
    total += paise(b.cost);
    const parts = b.parts?.length ? b.parts : null;
    // Parts that don't add up to the bill (Tesla's own rounding) leave the bill unitemised.
    if (!parts || parts.reduce((a, p) => a + paise(p.amount), 0) !== paise(b.cost)) {
      unitemised += paise(b.cost);
      continue;
    }
    for (const p of parts) sums[p.from].set(p.label, (sums[p.from].get(p.label) ?? 0) + paise(p.amount));
  }
  const lines = (m: Map<string, number>, order: (a: string, b: string) => number) =>
    // Discounts are negative: every line but a zero one counts, so the lines add up to the total.
    [...m].filter(([, v]) => v !== 0).sort(([a], [b]) => order(a, b)).map(([label, v]) => ({ label, amount: v / 100 }));
  const rank = (label: string) => (INVOICE_ORDER.includes(label) ? INVOICE_ORDER.indexOf(label) : INVOICE_ORDER.length);
  return {
    // Charging first, then Tesla's other fees by name.
    supercharger: lines(sums.supercharger, (a, b) => (a === "Charging" ? -1 : b === "Charging" ? 1 : a.localeCompare(b))),
    invoice: lines(sums.invoice, (a, b) => rank(a) - rank(b)),
    unitemised: unitemised / 100,
    total: total / 100,
  };
}

// Time on the charger by kind in a span, in ms, after TeslaMate's AC/DC duration: Superchargers from
// Tesla's times, the rest from the car's own sessions. Pass only the streamed sessions Tesla didn't bill.
export function chargingTime(
  sessions: { started_at: string; stopped_at: string | null }[],
  streamOnly: { started_at: string; ended_at: string | null; kind: "ac" | "dc" }[],
  span: Span,
): { ac: number; dc: number } {
  const charged = { ac: 0, dc: 0 };
  for (const s of sessions) {
    if (s.stopped_at && within(span)(s)) charged.dc += Date.parse(s.stopped_at) - Date.parse(s.started_at);
  }
  for (const s of streamOnly) {
    if (s.ended_at && within(span)(s)) charged[s.kind] += Date.parse(s.ended_at) - Date.parse(s.started_at);
  }
  return charged;
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
