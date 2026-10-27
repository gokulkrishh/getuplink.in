import { describe, expect, test } from "bun:test";
import { chargingBills, invoiceParts, spendBreakdown } from "@/lib/charging-figures";
import { type InvoiceLine, lineItemsInput, lineRows, reconcile, type SentLine, storedLines } from "@/lib/invoice-items";

// Made-up invoices only: no real network, station or amount.

const PATH = "7/abc123.pdf";

// ₹100 of energy (10 kWh at ₹10), a ₹20 fee, CGST and SGST at 9%: ₹141.60.
const LINES: SentLine[] = [
  { label: "Energy charges", kind: "energy", amount: 100, kwh: 10, rate: 10 },
  { label: "Session fee", kind: "fee", amount: 20 },
  { label: "CGST 9%", kind: "tax", amount: 10.8, tax_rate: 9 },
  { label: "SGST 9%", kind: "tax", amount: 10.8, tax_rate: 9 },
];
const ATTACHED = { amountTotal: 141.6, gst: 21.6 };

describe("the line_items input", () => {
  test("what a bot sends parses", () => {
    expect(lineItemsInput.parse(LINES)).toEqual(LINES);
  });

  test("anything off the shape is refused", () => {
    const line = { label: "Energy", kind: "energy", amount: 10 };
    expect(lineItemsInput.safeParse([]).success).toBe(false);
    expect(lineItemsInput.safeParse([{ ...line, kind: "electricity" }]).success).toBe(false);
    expect(lineItemsInput.safeParse([{ ...line, amount: "10" }]).success).toBe(false);
    expect(lineItemsInput.safeParse([{ ...line, label: "" }]).success).toBe(false);
    expect(lineItemsInput.safeParse([{ ...line, amount: Number.NaN }]).success).toBe(false);
    expect(lineItemsInput.safeParse(Array(41).fill(line)).success).toBe(false);
  });
});

describe("reconcile", () => {
  test("lines that add up are kept, with the file they came with and tidied labels", () => {
    const r = reconcile([{ ...LINES[0], label: "  Energy \n charges " }, ...LINES.slice(1)], ATTACHED, PATH);
    expect(r).toEqual({ ok: true, items: { path: PATH, total: 141.6, lines: expect.any(Array) } });
    if (r.ok) {
      expect(r.items.lines.map((l) => l.kind)).toEqual(["energy", "fee", "tax", "tax"]);
      expect(r.items.lines[0]).toEqual({ label: "Energy charges", kind: "energy", amount: 100, kwh: 10, rate: 10 });
      expect(r.items.lines[2].taxRate).toBe(9);
    }
  });

  test("a discount counts against the total, and must be negative", () => {
    const lines: SentLine[] = [
      { label: "Energy", kind: "energy", amount: 100 },
      { label: "Promo", kind: "discount", amount: -10 },
      { label: "GST 18%", kind: "tax", amount: 16.2, tax_rate: 18 },
    ];
    expect(reconcile(lines, { amountTotal: 106.2, gst: 16.2 }, PATH).ok).toBe(true);
    const positive = lines.map((l) => (l.kind === "discount" ? { ...l, amount: 10 } : l));
    expect(reconcile(positive, { amountTotal: 126.2, gst: 16.2 }, PATH)).toMatchObject({ ok: false, reason: "sign" });
  });

  test("lines more than ₹1 off the total are refused, saying both sums", () => {
    expect(reconcile(LINES, { amountTotal: 150, gst: 21.6 }, PATH)).toEqual({
      ok: false,
      reason: "lines-total",
      message: "Lines not saved: they add to ₹141.60, the invoice says ₹150.00.",
    });
  });

  test("under ₹1 off the total becomes a Rounding line, so the lines add up to the paisa", () => {
    const r = reconcile(LINES, { amountTotal: 142, gst: 21.6 }, PATH);
    expect(r.ok && r.items.lines.at(-1)).toEqual({ label: "Rounding", kind: "other", amount: 0.4 });
  });

  test("taxes must agree with the GST attached and with their rate", () => {
    expect(reconcile(LINES, { amountTotal: 141.6, gst: 30 }, PATH)).toMatchObject({ ok: false, reason: "gst", message: "Lines not saved: the tax lines add to ₹21.60, the GST says ₹30.00." });
    // GST attached, but no tax line sent.
    expect(reconcile([{ label: "Charging", kind: "energy", amount: 141.6 }], ATTACHED, PATH)).toMatchObject({ ok: false, reason: "gst" });
    // 9% of ₹120 isn't ₹15.
    const wrongRate: SentLine[] = [
      { label: "Energy", kind: "energy", amount: 120 },
      { label: "CGST", kind: "tax", amount: 15, tax_rate: 9 },
      { label: "SGST", kind: "tax", amount: 15, tax_rate: 9 },
    ];
    expect(reconcile(wrongRate, { amountTotal: 150, gst: null }, PATH)).toMatchObject({ ok: false, reason: "tax-rate", message: "Lines not saved: CGST isn't 9% of the lines before tax." });
  });

  test("a round-off line is left out of the base the tax rate is checked on", () => {
    const lines: SentLine[] = [
      { label: "Energy", kind: "energy", amount: 120 },
      { label: "IGST 18%", kind: "tax", amount: 21.6, tax_rate: 18 },
      { label: "Round off", kind: "other", amount: 0.4 },
    ];
    expect(reconcile(lines, { amountTotal: 142, gst: 21.6 }, PATH).ok).toBe(true);
  });

  test("kWh and rate that don't come to the amount are dropped, the line kept", () => {
    const r = reconcile([{ ...LINES[0], rate: 12 }, ...LINES.slice(1)], ATTACHED, PATH);
    expect(r.ok && r.items.lines[0]).toEqual({ label: "Energy charges", kind: "energy", amount: 100 });
  });
});

describe("stored lines", () => {
  const items = () => {
    const r = reconcile(LINES, ATTACHED, PATH);
    if (!r.ok) throw new Error("fixture");
    return r.items;
  };

  test("shown while they belong to the invoice's file and add up to its amount", () => {
    expect(storedLines(items(), { invoicePath: PATH, amountTotal: 141.6 })).toHaveLength(4);
  });

  test("lines sent with no file are shown while the invoice still has none", () => {
    const r = reconcile(LINES, ATTACHED, null);
    expect(r.ok && storedLines(r.items, { invoicePath: null, amountTotal: 141.6 })).toHaveLength(4);
    expect(r.ok && storedLines(r.items, { invoicePath: PATH, amountTotal: 141.6 })).toBe(null);
  });

  test("not shown for a replaced file, a changed amount, a file dropped or a malformed value", () => {
    expect(storedLines(items(), { invoicePath: "7/other.pdf", amountTotal: 141.6 })).toBe(null);
    expect(storedLines(items(), { invoicePath: PATH, amountTotal: 141.61 })).toBe(null);
    expect(storedLines(items(), { invoicePath: null, amountTotal: 141.6 })).toBe(null);
    expect(storedLines(null, { invoicePath: PATH, amountTotal: 141.6 })).toBe(null);
    expect(storedLines({ ...items(), lines: [{ label: "x", kind: "bogus", amount: 141.6 }] }, { invoicePath: PATH, amountTotal: 141.6 })).toBe(null);
  });
});

describe("display", () => {
  const lines: InvoiceLine[] = [
    { label: "CGST", kind: "tax", amount: 10.8, taxRate: 9 },
    { label: "Energy charges", kind: "energy", amount: 100, kwh: 10, rate: 10 },
    { label: "Promo", kind: "discount", amount: -10 },
    { label: "SGST 9%", kind: "tax", amount: 10.8, taxRate: 9 },
    { label: "Idle fee", kind: "idle", amount: 0 },
  ];

  test("session page: charges in the invoice's order, then taxes, with kWh at rate and the tax rate", () => {
    const rows = lineRows(lines);
    expect(rows.map((r) => r.label)).toEqual(["Energy charges", "Promo", "Idle fee", "CGST", "SGST 9%"]);
    expect(rows[0].detail).toMatch(/^10(\.0)? kWh at ₹10(\.00)?\/kWh$/);
    expect(rows.slice(1).map((r) => r.detail)).toEqual([null, null, "9%", null]);
    expect(rows.map((r) => r.amount)).toEqual([100, -10, 0, 10.8, 10.8]);
  });

  test("a bill with lines splits by kind, discounts included, and adds up in What you paid for", () => {
    const parts = invoiceParts({ amount: 111.6, gst: 21.6, energyAmount: 100, lines });
    expect(parts?.map((p) => p.label)).toEqual(["GST", "Energy", "Discounts", "GST", "Idle fees"]);
    const bills = chargingBills([], [{ id: 1, started_at: "2026-10-03T10:00:00+05:30", energy_added_kwh: 10, kind: "dc" }], new Map([[1, { amount: 111.6, kwhBilled: 10, gst: 21.6, lines }]]));
    expect(spendBreakdown(bills, { from: 0, to: Infinity })).toEqual({
      supercharger: [],
      invoice: [
        { label: "Energy", amount: 100 },
        { label: "Discounts", amount: -10 },
        { label: "GST", amount: 21.6 },
      ],
      unitemised: 0,
      total: 111.6,
    });
  });

  test("lines that don't add up to the bill fall back to Before GST and GST", () => {
    expect(invoiceParts({ amount: 150, gst: 21.6, lines })?.map((p) => p.label)).toEqual(["Before GST", "GST"]);
  });
});
