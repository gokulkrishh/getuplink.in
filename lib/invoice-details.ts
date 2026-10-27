import { z } from "zod";

// What else an invoice prints, beyond its lines and the fixed fields (network, station, times, kWh, total,
// GST, invoice number): payment method, station and charger IDs, booking ID, the operator's GSTIN and SAC.
// Each network prints its own set, so they're label and value pairs, shown as printed under the invoice.

export type InvoiceDetail = { label: string; value: string };

const MAX_DETAILS = 12;

export const detailsInput = z
  .array(
    z.object({
      label: z.string().min(1).max(40).describe("The detail's name as printed, e.g. Paid by, Station ID, Charger ID, Booking ID, GSTIN, SAC"),
      value: z.string().min(1).max(80).describe("Its value as printed"),
    }),
  )
  .max(MAX_DETAILS)
  .describe(
    "Other details printed on the invoice that aren't a line or another field: the duration exactly as printed, how it was paid, station ID, charger ID, booking ID, the operator's GSTIN and SAC. Never the owner's name, phone, email, address, car number or card, UPI or account details",
  );

// Details about the owner, never kept even if sent: their name, contact, address, car number or payment
// account. "Paid by App Wallet" stays; "Card ending 1234" doesn't.
const PERSONAL = /\b(name|customer|user|phone|mobile|contact|e-?mail|address|vehicle|registration|reg\.? ?no|car (number|no)|card|upi|vpa|account|a\/c|ifsc)\b/i;
const PERSONAL_VALUE = /@|\b\d{10,}\b|\b(x{2,}|\*{2,})\d{2,}\b/i;

// The details worth keeping, trimmed, in the order printed, without repeats or anything personal.
export function keptDetails(sent: readonly InvoiceDetail[] | undefined): InvoiceDetail[] {
  const seen = new Set<string>();
  const out: InvoiceDetail[] = [];
  for (const d of sent ?? []) {
    const label = d.label.trim();
    const value = d.value.trim();
    if (!label || !value || PERSONAL.test(label) || PERSONAL_VALUE.test(value)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
    if (out.length === MAX_DETAILS) break;
  }
  return out;
}

// A stored value, read back: only well-formed pairs.
export function storedDetails(value: unknown): InvoiceDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is InvoiceDetail => typeof d?.label === "string" && typeof d?.value === "string");
}
