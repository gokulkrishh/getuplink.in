import { num } from "@/lib/telemetry-derive";

// The fee lines of a Supercharger bill, from charging_sessions.fees: Tesla's charging history sends an array
// of { feeType, currencyCode, usageBase, totalDue, uom } (see lib/server/charging.ts). It is documented
// loosely, so a line without a fee type or a numeric amount is skipped and counted, never guessed at.
// Pure, so tested.
export type FeeLine = { type: string; quantity: number | null; unit: string | null; amount: number; currency: string | null };

export type FeeLines = {
  lines: FeeLine[];
  // Lines that couldn't be read.
  skipped: number;
  // False when the lines shown don't add up to the session's total (a skipped line, or Tesla's own sums).
  addsUp: boolean;
};

const TYPES: Record<string, string> = { CHARGING: "Charging", PARKING: "Idle fee", CONGESTION: "Congestion fee" };

// "CHARGING" -> "Charging"; a type Uplink doesn't know is shown in Tesla's own words, "SOME_FEE" -> "Some fee".
function typeName(type: string): string {
  const key = type.trim().toUpperCase();
  if (TYPES[key]) return TYPES[key];
  const words = key.replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// "kwh" -> "kWh", "min" -> "min"; anything else as given.
function unitName(uom: unknown): string | null {
  if (typeof uom !== "string" || !uom.trim()) return null;
  const u = uom.trim();
  return u.toLowerCase() === "kwh" ? "kWh" : u.toLowerCase() === "min" ? "min" : u;
}

export function feeLines(fees: unknown, total: number | null): FeeLines | null {
  if (!Array.isArray(fees)) return null;
  let skipped = 0;
  const lines: FeeLine[] = [];
  for (const fee of fees) {
    const f = typeof fee === "object" && fee !== null ? (fee as Record<string, unknown>) : null;
    const amount = num(f?.totalDue);
    if (!f || typeof f.feeType !== "string" || !f.feeType.trim() || amount === null) {
      skipped++;
      continue;
    }
    const quantity = num(f.usageBase);
    const unit = unitName(f.uom);
    // A line for nothing (no idle time, nothing due) only adds noise.
    if (amount === 0 && !quantity) continue;
    lines.push({
      type: typeName(f.feeType),
      quantity: unit ? quantity : null,
      unit: quantity !== null ? unit : null,
      amount,
      currency: typeof f.currencyCode === "string" && f.currencyCode ? f.currencyCode : null,
    });
  }
  if (lines.length === 0) return null;
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  return { lines, skipped, addsUp: skipped === 0 && (total === null || Math.abs(sum - total) < 0.01) };
}
