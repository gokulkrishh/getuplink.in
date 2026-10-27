import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb } from "./fake-db";

// attach_charge_invoice with line_items: kept when they add up, the invoice saved either way, and the same
// invoice sent again with lines gets them without a second invoice. A made-up network, session and bill.

let fake: FakeDb;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));

const { asOwner } = await import("@/lib/server/data/owner");
// Its own copy of the module: other test files mock @/lib/server/receipts for the whole run.
const OWN_COPY: string = "../lib/server/receipts.ts?attach-lines";
const { attachInvoice, invoicesBySession } = (await import(OWN_COPY)) as typeof import("@/lib/server/receipts");

const A: Owner = asOwner(1, "tesla-a");

// 7:10 PM to 7:50 PM IST, 20 kWh, at a third-party DC charger.
const SESSION = { user_id: 1, id: 5, vin: "VIN_A", started_at: "2026-10-20T13:40:00.000Z", ended_at: "2026-10-20T14:20:00.000Z", kind: "dc", supercharger: false, energy_added_kwh: 20 };

const INVOICE = { network: "MadeUpCharge", started_at: "2026-10-20T19:10", ended_at: "2026-10-20T19:50", kwh_billed: 20, amount_total: 141.6, gst: 21.6, source_ref: "chat:made-up" };

const LINES = [
  { label: "Energy charges", kind: "energy" as const, amount: 100, kwh: 20, rate: 5 },
  { label: "Session fee", kind: "fee" as const, amount: 20 },
  { label: "CGST 9%", kind: "tax" as const, amount: 10.8, tax_rate: 9 },
  { label: "SGST 9%", kind: "tax" as const, amount: 10.8, tax_rate: 9 },
];

beforeEach(() => {
  fake = new FakeDb({ stream_charge_sessions: [{ ...SESSION }], charge_receipts: [] });
});

const receipt = () => fake.rows("charge_receipts").find((r) => r.session_id === 5);

describe("attaching with line_items", () => {
  test("lines that add up are saved with the invoice, and shown", async () => {
    const result = await attachInvoice(A, { ...INVOICE, line_items: LINES });
    expect(result).toMatchObject({ status: "attached", lines: "Lines saved: 4." });
    expect(receipt()?.line_items).toMatchObject({ path: null, total: 141.6 });
    expect((await invoicesBySession(A, [5])).get(5)?.lines?.map((l) => l.kind)).toEqual(["energy", "fee", "tax", "tax"]);
  });

  test("lines that don't add up: the invoice is saved as before, and the result says why", async () => {
    const result = await attachInvoice(A, { ...INVOICE, line_items: [...LINES, { label: "Parking", kind: "parking", amount: 8.4 }] });
    expect(result).toMatchObject({ status: "attached", lines: "Lines not saved: they add to ₹150.00, the invoice says ₹141.60." });
    expect(receipt()).toMatchObject({ amount_total: 141.6, gst: 21.6 });
    expect(receipt()?.line_items).toBeUndefined();
    expect((await invoicesBySession(A, [5])).get(5)).toMatchObject({ amount: 141.6, lines: null });
  });

  test("the same invoice sent again with lines adds them, without a second invoice", async () => {
    expect(await attachInvoice(A, INVOICE)).toMatchObject({ status: "attached" });
    expect(await attachInvoice(A, INVOICE)).toEqual({ status: "already_attached", session_id: 5 });
    expect(await attachInvoice(A, { ...INVOICE, line_items: LINES })).toEqual({ status: "already_attached", session_id: 5, lines: "Lines saved: 4." });
    expect(fake.rows("charge_receipts")).toHaveLength(1);
    expect(receipt()?.line_items).toMatchObject({ total: 141.6 });
  });

  test("without a source or invoice number, the same amount on the session takes the lines", async () => {
    const { source_ref: _, ...plain } = INVOICE;
    await attachInvoice(A, plain);
    expect(await attachInvoice(A, { ...plain, line_items: LINES })).toEqual({ status: "already_attached", session_id: 5, lines: "Lines saved: 4." });
    // A different amount is a different invoice: the owner decides whether it replaces this one.
    expect(await attachInvoice(A, { ...plain, amount_total: 150, line_items: LINES })).toMatchObject({ status: "session_has_invoice" });
  });

  test("a replaced invoice keeps none of the old one's lines", async () => {
    await attachInvoice(A, { ...INVOICE, line_items: LINES });
    await attachInvoice(A, { ...INVOICE, source_ref: "chat:other", amount_total: 142, replace: true });
    expect(receipt()?.line_items).toBe(null);
  });
});
