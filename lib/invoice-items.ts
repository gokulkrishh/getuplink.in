import { z } from "zod";
import { formatMoney, formatNumber } from "@/lib/format";

// A charging invoice's own lines, as the owner's AI sends them with attach_charge_invoice
// (app/api/mcp/route.ts), and the checks that decide whether they're kept. Pure: no network, no database.
// What's sent is untrusted data: it's parsed with zod, and kept only when the lines add up to the amount
// the invoice was attached with and the taxes agree with them.

export const LINE_KINDS = ["energy", "fee", "idle", "parking", "discount", "tax", "other"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

// One line as printed, in ₹. Discounts are negative. kwh and rate (₹/kWh) only where the line prints them
// and they agree with its amount; taxRate is the percentage, e.g. 9 for CGST 9%.
export type InvoiceLine = { label: string; kind: LineKind; amount: number; kwh?: number; rate?: number; taxRate?: number };

// What's stored in charge_receipts.line_items: the lines, the total they add up to, and the invoice file
// they came with (null when only the numbers were sent), so a replaced invoice never shows the old lines.
export type StoredItems = { path: string | null; total: number; lines: InvoiceLine[] };

export const MAX_LINES = 40;
const MAX_LABEL = 80;
// ₹1, in paise: how far the lines may be from the invoice's total. Indian invoices round the payable
// amount to the rupee.
export const TOLERANCE_PAISE = 100;

export const paise = (n: number) => Math.round(n * 100);

// ---- What the AI sends ----

const money = z.number().finite().gt(-1_000_000).lt(1_000_000);

// The tool's line_items input, described for the AI that fills it in.
export const lineItemsInput = z
  .array(
    z.object({
      label: z
        .string()
        .min(1)
        .max(MAX_LABEL)
        .describe("The line's name as printed, e.g. Energy charges, Idle fee, CGST 9%"),
      kind: z
        .enum(LINE_KINDS)
        .describe(
          "energy: the electricity itself. fee: session, service, platform or convenience fees. idle: idle or overstay fees. parking. discount. tax: each tax line (CGST, SGST, IGST). other: round-off and anything else",
        ),
      amount: money.describe("Rupees, exactly as printed. Discounts negative"),
      kwh: z.number().finite().positive().lt(10_000).optional().describe("kWh on this line, only if printed on it"),
      rate: z.number().finite().positive().lt(10_000).optional().describe("Rupees per kWh on this line, only if printed on it"),
      tax_rate: z.number().finite().positive().max(50).optional().describe("A tax line's percentage as printed, e.g. 9 for CGST 9%"),
    }),
  )
  .min(1)
  .max(MAX_LINES)
  .describe("Every line printed on the invoice that adds to or takes from the total, without subtotals, so they add up to amount_total");
export type SentLine = z.infer<typeof lineItemsInput>[number];

// ---- Reconciliation ----

export type ReconcileFailure = "sign" | "lines-total" | "gst" | "tax-rate";
// message: one line for the AI, saying what didn't add up, so it can send the lines again.
export type Reconciled = { ok: true; items: StoredItems } | { ok: false; reason: ReconcileFailure; message: string };

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_PAISE;
const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + paise(l.amount), 0);
const rupees = (p: number) => formatMoney(p / 100, "INR");

// The lines sent, kept only when they hold together:
// - discounts are negative and every other line isn't;
// - the lines add up to `amountTotal` (what was attached) within ₹1;
// - the tax lines add up to `gst` when the invoice was attached with one, and any with a rate come to that
//   rate of the lines before tax (all of them, or all but "other" lines such as a round-off);
// - an invoice attached with GST has tax lines.
// A line's kWh and rate are dropped when they don't come to its amount: only what holds up is shown.
// What's left between the lines and `amountTotal` (under ₹1) becomes a Rounding line, so the stored lines
// add up to the amount exactly, as every spend figure counts it.
export function reconcile(sent: readonly SentLine[], attached: { amountTotal: number; gst: number | null }, path: string | null): Reconciled {
  const lines: InvoiceLine[] = sent.map((l) => {
    const label = l.label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
    const line: InvoiceLine = { label: label || KIND_LABELS[l.kind], kind: l.kind, amount: l.amount };
    if (l.kwh !== undefined && l.rate !== undefined) {
      if (near(paise(l.kwh * l.rate), paise(l.amount))) Object.assign(line, { kwh: l.kwh, rate: l.rate });
    } else if (l.kwh !== undefined) line.kwh = l.kwh;
    if (l.kind === "tax" && l.tax_rate !== undefined) line.taxRate = l.tax_rate;
    return line;
  });
  const fail = (reason: ReconcileFailure, message: string): Reconciled => ({ ok: false, reason, message: `Lines not saved: ${message}` });
  if (lines.some((l) => (l.kind === "discount" ? l.amount > 0 : l.amount < 0))) {
    return fail("sign", "discounts must be negative and every other line zero or more.");
  }
  const total = sum(lines);
  if (!near(total, paise(attached.amountTotal))) return fail("lines-total", `they add to ${rupees(total)}, the invoice says ${rupees(paise(attached.amountTotal))}.`);

  const taxes = lines.filter((l) => l.kind === "tax");
  if (attached.gst != null && (attached.gst > 0 ? taxes.length === 0 || !near(sum(taxes), paise(attached.gst)) : sum(taxes) !== 0)) {
    return fail("gst", `the tax lines add to ${rupees(sum(taxes))}, the GST says ${rupees(paise(attached.gst))}.`);
  }
  const before = lines.filter((l) => l.kind !== "tax");
  const bases = [sum(before), sum(before.filter((l) => l.kind !== "other"))];
  for (const t of taxes) {
    if (t.taxRate !== undefined && !bases.some((base) => near(paise(t.amount), (base * t.taxRate!) / 100))) {
      return fail("tax-rate", `${t.label} isn't ${t.taxRate}% of the lines before tax.`);
    }
  }

  const rest = paise(attached.amountTotal) - total;
  if (rest !== 0) lines.push({ label: "Rounding", kind: "other", amount: rest / 100 });
  return { ok: true, items: { path, total: attached.amountTotal, lines } };
}

// ---- Reading what's stored ----

const storedLine = z.object({
  label: z.string().min(1).max(MAX_LABEL),
  kind: z.enum(LINE_KINDS),
  amount: money,
  kwh: z.number().finite().positive().optional(),
  rate: z.number().finite().positive().optional(),
  taxRate: z.number().finite().positive().optional(),
});
const storedItems = z.object({ path: z.string().nullable(), total: money, lines: z.array(storedLine).min(1).max(MAX_LINES + 1) });

// The stored lines, when they still belong to this invoice: sent with the file it has now (or with none,
// both times), and adding up to the amount it was attached with, to the paisa. Null otherwise (no lines,
// replaced, or changed).
export function storedLines(raw: unknown, receipt: { invoicePath: string | null; amountTotal: number }): InvoiceLine[] | null {
  if (raw == null) return null;
  const parsed = storedItems.safeParse(raw);
  if (!parsed.success || parsed.data.path !== receipt.invoicePath) return null;
  return sum(parsed.data.lines) === paise(receipt.amountTotal) ? parsed.data.lines : null;
}

// ---- Display ----

// One name per kind, for adding lines up across invoices (what you paid for over a month): networks name
// the same charge differently. Every tax (CGST, SGST, IGST) is GST on Indian charging invoices.
export const KIND_LABELS: Record<LineKind, string> = {
  energy: "Energy",
  fee: "Fees",
  idle: "Idle fees",
  parking: "Parking",
  discount: "Discounts",
  tax: "GST",
  other: "Other",
};

// The lines of one invoice for its session page, as printed: charges first in the invoice's order, then
// taxes. detail is "23.4 kWh at ₹18.50/kWh" where the line prints both, or the tax rate.
// One row of the invoice table: kWh as printed (to the hundredth, as bills print it), the rate per kWh, or a
// tax line's percentage in the rate column.
export type LineRow = { label: string; kwh: string | null; rate: string | null; amount: number };

const percent = (n: number) => `${formatNumber(n, Number.isInteger(n) ? 0 : 2)}%`;
export const printedKwh = (n: number) => `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)} kWh`;

// Charges in the invoice's order, then taxes, then a round-off or other line just above the total.
export function lineRows(lines: readonly InvoiceLine[]): LineRow[] {
  const row = (l: InvoiceLine): LineRow => ({
    label: l.label,
    kwh: l.kwh !== undefined ? printedKwh(l.kwh) : null,
    rate: l.rate !== undefined ? `${formatMoney(l.rate, "INR")}/kWh` : l.taxRate !== undefined && !l.label.includes("%") ? percent(l.taxRate) : null,
    amount: l.amount,
  });
  const charges = lines.filter((l) => l.kind !== "tax" && l.kind !== "other");
  return [...charges, ...lines.filter((l) => l.kind === "tax"), ...lines.filter((l) => l.kind === "other")].map(row);
}
