// The owner's own charging rates, for charging Tesla doesn't bill: home AC and third-party DC.
export type ChargingRates = { home: number | null; other: number | null };

// ₹/kWh. Matches the check in the owner_settings migration.
export const MAX_RATE = 100;

// "" means not set. Up to two decimals, above zero, at most MAX_RATE; anything else is invalid.
export function parseRate(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { ok: true, value: null };
  // Digits only ("1e1" passes Number); ".5" and "5." are fine, as browsers send them.
  if (!/^(?=\.?\d)\d{0,3}(\.\d{0,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  return value > 0 && value <= MAX_RATE ? { ok: true, value } : { ok: false };
}

// kWh × the owner's rate for a session the car reported. Superchargers keep Tesla's billed amount.
export function streamCost(
  s: { kind: "ac" | "dc"; supercharger: boolean; energy_added_kwh: number | null },
  rates: ChargingRates,
): number | null {
  if (s.supercharger || !s.energy_added_kwh || s.energy_added_kwh <= 0) return null;
  const rate = s.kind === "ac" ? rates.home : rates.other;
  return rate === null ? null : Math.round(s.energy_added_kwh * rate * 100) / 100;
}

export type Priced = { started_at: string; cost: number; energy: number };

// The sessions that have a cost at the owner's rates. Pass only sessions Tesla didn't bill, or a
// Supercharger session the car also reported would count twice.
export function pricedSessions(
  sessions: { started_at: string; kind: "ac" | "dc"; supercharger: boolean; energy_added_kwh: number | null }[],
  rates: ChargingRates,
): Priced[] {
  return sessions.flatMap((s) => {
    const cost = streamCost(s, rates);
    return cost === null ? [] : [{ started_at: s.started_at, cost, energy: s.energy_added_kwh ?? 0 }];
  });
}
