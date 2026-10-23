import { inSpan, type Slot, type Span, sumBySlot } from "@/lib/periods";

// What charging cost and added in a span, counted the way the Charging page counts it. Pass Tesla's
// sessions and only the streamed sessions Tesla didn't bill (see matchSessions), so none counts twice.

type Billed = { started_at: string; cost_total: number | null; energy_kwh: number | null; currency: string | null };
type Streamed = { started_at: string; energy_added_kwh: number | null };

const within = (span: Span) => (s: { started_at: string }) => inSpan(Date.parse(s.started_at), span);

// Tesla's billed Supercharger amounts. The sessions only the car reported have no cost.
export function spendIn(sessions: Billed[], span: Span): { cost: number; currency: string } {
  return {
    cost: sessions.filter(within(span)).reduce((sum, s) => sum + (s.cost_total ?? 0), 0),
    currency: sessions.find((s) => s.currency)?.currency ?? "INR",
  };
}

// Spend per bar, counted like spendIn.
export function spendBySlot(sessions: Billed[], slots: Slot[]): number[] {
  return sumBySlot(sessions, slots, (s) => Date.parse(s.started_at), (s) => s.cost_total ?? 0);
}

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
