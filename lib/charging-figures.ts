import type { Priced } from "@/lib/charging-rates";
import { inSpan, type Slot, type Span, sumBySlot } from "@/lib/periods";

// What charging cost and added in a span, counted the way the Charging page counts it. Pass Tesla's
// sessions and only the streamed sessions Tesla didn't bill (see matchSessions), so none counts twice.

type Billed = { started_at: string; cost_total: number | null; energy_kwh: number | null; currency: string | null };
type Streamed = { started_at: string; energy_added_kwh: number | null };

const within = (span: Span) => (s: { started_at: string }) => inSpan(Date.parse(s.started_at), span);

// Tesla's billed Supercharger amounts plus the rest at the owner's rates (`priced`, see pricedSessions).
// `atYourRates` is the second part, for the "Includes ₹x at your rates" note.
export function spendIn(sessions: Billed[], priced: Priced[], span: Span): { cost: number; atYourRates: number; currency: string } {
  const billed = sessions.filter(within(span));
  const atYourRates = priced.filter(within(span)).reduce((sum, p) => sum + p.cost, 0);
  return {
    cost: billed.reduce((sum, s) => sum + (s.cost_total ?? 0), 0) + atYourRates,
    atYourRates,
    currency: sessions.find((s) => s.currency)?.currency ?? "INR",
  };
}

// Spend per bar, counted like spendIn.
export function spendBySlot(sessions: Billed[], priced: Priced[], slots: Slot[]): number[] {
  const billed = sumBySlot(sessions, slots, (s) => Date.parse(s.started_at), (s) => s.cost_total ?? 0);
  const atYourRates = sumBySlot(priced, slots, (p) => Date.parse(p.started_at), (p) => p.cost);
  return billed.map((value, k) => value + atYourRates[k]);
}

// Tesla's billed kWh for its sessions, the car's own figure for the others.
export function energyIn(sessions: Billed[], streamOnly: Streamed[], span: Span): number {
  const kwh = (value: number | null) => (value && value > 0 ? value : 0);
  return (
    sessions.filter(within(span)).reduce((sum, s) => sum + kwh(s.energy_kwh), 0) +
    streamOnly.filter(within(span)).reduce((sum, s) => sum + kwh(s.energy_added_kwh), 0)
  );
}
