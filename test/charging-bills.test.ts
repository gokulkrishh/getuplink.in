import { describe, expect, test } from "bun:test";
import { matchSessions } from "@/lib/charge-sessions";
import { billedCharges, billsBySlot, billsIn, chargingBills } from "@/lib/charging-figures";
import { monthlyRows } from "@/lib/monthly";
import { periodSpan, slotsFor } from "@/lib/periods";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);
const iso = (local: string) => new Date(ist(local)).toISOString();

const VIN = "LRWYGCEK0PC000001";
const tesla = (id: string, local: string, cost: number | null, kwh = 40) => ({
  session_id: id,
  vehicle_vin: VIN,
  site_name: "Bengaluru, Koramangala",
  started_at: iso(local),
  stopped_at: new Date(ist(local) + 40 * 60_000).toISOString(),
  energy_kwh: kwh,
  cost_total: cost,
  currency: "INR",
});
const stream = (id: number, local: string, kind: "ac" | "dc", supercharger: boolean, kwh: number, ended = true) => ({
  id,
  vin: VIN,
  started_at: iso(local),
  ended_at: ended ? new Date(ist(local) + 40 * 60_000).toISOString() : null,
  kind,
  supercharger,
  energy_added_kwh: kwh,
});

// October: a Supercharger charge Tesla billed (and the car streamed), the IndianOil e-Charge session
// at a third-party DC station with its invoice, a third-party DC charge with no invoice, and home AC.
const teslaSessions = [tesla("t1", "2026-10-10T10:00:00", 1012)];
const streamed = [
  stream(1, "2026-10-10T10:01:00", "dc", true, 40.5),
  stream(2, "2026-10-25T21:25:00", "dc", false, 14.56),
  stream(3, "2026-10-18T19:00:00", "dc", false, 22),
  stream(4, "2026-10-20T23:00:00", "ac", false, 30),
];
const invoices = new Map<number, { amount: number; kwhBilled: number | null }>([[2, { amount: 243.52, kwhBilled: 14.74 }]]);
const now = ist("2026-10-25T23:00:00");
const { streamOnly } = matchSessions(teslaSessions, streamed, now);
const month = periodSpan("month", now);

describe("chargingBills", () => {
  test("Tesla's bill and the attached invoice, each counted once", () => {
    const bills = chargingBills(teslaSessions, streamOnly, invoices);
    expect(bills).toEqual([
      { started_at: teslaSessions[0].started_at, cost: 1012, kwh: 40, kind: "dc" },
      { started_at: streamed[1].started_at, cost: 243.52, kwh: 14.74, kind: "dc" },
    ]);
    expect(billsIn(bills, month).cost).toBeCloseTo(1255.52, 6);
  });

  test("a charge with no bill adds nothing and is never priced", () => {
    expect(billsIn(chargingBills([], streamOnly, new Map()), month)).toMatchObject({ cost: 0, count: 0 });
    expect(billsIn(chargingBills([tesla("t2", "2026-10-11T10:00:00", null)], [], new Map()), month).cost).toBe(0);
  });

  test("an invoice on its own counts: the day it was attached is no longer ₹0", () => {
    const bills = chargingBills([], [streamed[1]], invoices);
    expect(billsIn(bills, { from: ist("2026-10-25T00:00:00"), to: ist("2026-10-26T00:00:00") }).cost).toBe(243.52);
  });

  test("the streamed twin of a Supercharger session is not billed twice", () => {
    // Even if an invoice were attached to the twin, Tesla's bill is the one counted.
    const bills = chargingBills(teslaSessions, streamOnly, new Map([[1, { amount: 999, kwhBilled: null }], ...invoices]));
    expect(billsIn(bills, month).cost).toBeCloseTo(1255.52, 6);
  });

  test("the bars add up to the total, so the home tile, its sparkline and Charging agree", () => {
    const bills = chargingBills(teslaSessions, streamOnly, invoices);
    const slots = slotsFor("month", now);
    const bars = billsBySlot(bills, slots);
    expect(bars.reduce((a, b) => a + b, 0)).toBeCloseTo(billsIn(bills, month).cost, 6);
  });

  test("billed kWh falls back to what the car added", () => {
    const bills = chargingBills([], [streamed[1]], new Map([[2, { amount: 243.52, kwhBilled: null }]]));
    expect(bills[0].kwh).toBe(14.56);
  });
});

describe("billedCharges", () => {
  test("the months count the invoice and the charges with no bill", () => {
    const charges = billedCharges(teslaSessions, streamOnly, invoices);
    // Three finished streamed charges Tesla didn't bill, and Tesla's one.
    expect(charges).toHaveLength(4);
    const [october] = monthlyRows([], charges, ist("2026-10-01T00:00:00"), now);
    expect(october.spend).toBeCloseTo(1255.52, 6);
    expect(october.unbilled).toBe(2);
    expect(october.spend).toBeCloseTo(billsIn(chargingBills(teslaSessions, streamOnly, invoices), month).cost, 6);
  });

  test("a charge still in progress isn't a charge yet", () => {
    expect(billedCharges([], [stream(9, "2026-10-25T22:00:00", "dc", false, 5, false)], new Map())).toEqual([]);
  });
});
