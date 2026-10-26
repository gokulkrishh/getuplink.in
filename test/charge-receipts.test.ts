import { describe, expect, test } from "bun:test";
import { type Invoice, invoiceProblem, matchInvoice, pickedSessionFits, type ReceiptSession, sameOperator } from "@/lib/charge-receipts";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);
const iso = (local: string) => new Date(ist(local)).toISOString();

const session = (over: Partial<ReceiptSession> = {}): ReceiptSession => ({
  id: 1,
  started_at: iso("2026-10-21T19:10:00"),
  ended_at: iso("2026-10-21T20:40:00"),
  kind: "ac",
  supercharger: false,
  energy_added_kwh: 16.9,
  station_name: "ChargeMOD, Kochi",
  ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  network: "ChargeMOD",
  startedAt: ist("2026-10-21T19:12:00"),
  endedAt: ist("2026-10-21T20:41:00"),
  kwhBilled: 18.2,
  amountTotal: 412,
  gst: 62.85,
  ...over,
});

describe("matchInvoice", () => {
  test("attaches to the one session that fits", () => {
    expect(matchInvoice(invoice(), [session()])).toEqual({ kind: "match", session: session() });
  });
  test("refuses a session from another day", () => {
    expect(matchInvoice(invoice(), [session({ started_at: iso("2026-10-20T19:10:00"), ended_at: iso("2026-10-20T20:40:00") })]).kind).toBe("none");
  });
  test("refuses billed kWh far from what the car added", () => {
    expect(matchInvoice(invoice({ kwhBilled: 30 }), [session()]).kind).toBe("none");
    expect(matchInvoice(invoice({ kwhBilled: 15 }), [session()]).kind).toBe("none");
  });
  test("DC allows less over than AC", () => {
    const dc = session({ kind: "dc", energy_added_kwh: 30 });
    expect(matchInvoice(invoice({ kwhBilled: 33 }), [dc]).kind).toBe("match");
    expect(matchInvoice(invoice({ kwhBilled: 36 }), [dc]).kind).toBe("none");
  });
  test("refuses a station run by another operator, allows one that doesn't say", () => {
    expect(matchInvoice(invoice(), [session({ station_name: "Tata Power, Kochi" })]).kind).toBe("none");
    expect(matchInvoice(invoice(), [session({ station_name: null })]).kind).toBe("match");
    expect(matchInvoice(invoice(), [session({ station_name: "Lulu Mall" })]).kind).toBe("match");
  });
  test("skips Superchargers and sessions still charging", () => {
    expect(matchInvoice(invoice(), [session({ supercharger: true })]).kind).toBe("none");
    expect(matchInvoice(invoice(), [session({ ended_at: null })]).kind).toBe("none");
  });
  test("an invoice without an end still matches on its start", () => {
    expect(matchInvoice(invoice({ endedAt: null }), [session()]).kind).toBe("match");
  });
  test("two that fit narrow to the one whose station names the network", () => {
    const other = session({ id: 2, station_name: null });
    expect(matchInvoice(invoice(), [session(), other])).toEqual({ kind: "match", session: session() });
  });
  test("two that fit equally are left for the owner", () => {
    const result = matchInvoice(invoice(), [session({ station_name: null }), session({ id: 2, station_name: null })]);
    expect(result.kind).toBe("ambiguous");
  });
});

describe("pickedSessionFits", () => {
  test("takes a picked session within two hours, not another day", () => {
    expect(pickedSessionFits(invoice({ startedAt: ist("2026-10-21T20:30:00"), endedAt: null }), session())).toBe(true);
    expect(pickedSessionFits(invoice({ startedAt: ist("2026-10-22T19:10:00"), endedAt: null }), session())).toBe(false);
  });
});

describe("sameOperator", () => {
  test("compares ignoring case and punctuation", () => {
    expect(sameOperator("Charge MOD", "chargeMOD, Kochi")).toBe(true);
    expect(sameOperator("Tata Power EZ Charge", "Tata Power, Kochi")).toBe(true);
    expect(sameOperator("ChargeMOD", "Statiq, Kochi")).toBe(false);
    expect(sameOperator("ChargeMOD", null)).toBe(null);
  });
});

describe("invoiceProblem", () => {
  const now = ist("2026-10-26T12:00:00");
  test("accepts a normal invoice", () => {
    expect(invoiceProblem(invoice(), now)).toBe(null);
  });
  test("refuses odd fields", () => {
    expect(invoiceProblem(invoice({ amountTotal: 0 }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ gst: 500 }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ kwhBilled: 400 }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ energyAmount: 360 }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ energyAmount: 0 }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ energyAmount: 340 }), now)).toBe(null);
    expect(invoiceProblem(invoice({ startedAt: ist("2026-08-01T10:00:00"), endedAt: null }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ startedAt: ist("2026-10-27T10:00:00"), endedAt: null }), now)).not.toBe(null);
    expect(invoiceProblem(invoice({ endedAt: ist("2026-10-21T19:00:00") }), now)).not.toBe(null);
  });
});
