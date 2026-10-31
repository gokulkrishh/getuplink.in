import { describe, expect, test } from "bun:test";
import { type Bill, chargingBills, chargingTime, invoiceParts, paidFor, spendBreakdown } from "@/lib/charging-figures";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);
const iso = (local: string) => new Date(ist(local)).toISOString();
const ALL = { from: -Infinity, to: Infinity };

describe("invoiceParts", () => {
  test("splits energy, fees and GST when the invoice prints the energy line and the GST", () => {
    expect(invoiceParts({ amount: 412, gst: 62.85, energyAmount: 330 })).toEqual([
      { from: "invoice", label: "Energy", amount: 330 },
      { from: "invoice", label: "Fees", amount: 19.15 },
      { from: "invoice", label: "GST", amount: 62.85 },
    ]);
  });

  test("leaves out a zero fee line", () => {
    expect(invoiceParts({ amount: 118, gst: 18, energyAmount: 100 })?.map((p) => p.label)).toEqual(["Energy", "GST"]);
  });

  test("with only the GST, splits before GST and GST", () => {
    expect(invoiceParts({ amount: 412, gst: 62.85 })).toEqual([
      { from: "invoice", label: "Before GST", amount: 349.15 },
      { from: "invoice", label: "GST", amount: 62.85 },
    ]);
  });

  test("without the GST, doesn't split: the rest could be fees or tax", () => {
    expect(invoiceParts({ amount: 412, energyAmount: 330 })).toBe(null);
    expect(invoiceParts({ amount: 412, gst: null })).toBe(null);
  });

  test("an energy line that doesn't fit falls back to before GST", () => {
    expect(invoiceParts({ amount: 412, gst: 62.85, energyAmount: 400 })?.map((p) => p.label)).toEqual(["Before GST", "GST"]);
  });
});

describe("spendBreakdown", () => {
  const bill = (local: string, cost: number, parts: Bill["parts"]): Bill => ({ started_at: iso(local), cost, kwh: 20, kind: "dc", parts });

  test("adds up each label and keeps unitemised bills apart, to the paisa", () => {
    const bills = [
      bill("2026-10-01T10:00:00", 500.1, [
        { from: "supercharger", label: "Charging", amount: 480.1 },
        { from: "supercharger", label: "Idle fee", amount: 20 },
      ]),
      bill("2026-10-02T10:00:00", 0.3, [{ from: "supercharger", label: "Charging", amount: 0.3 }]),
      bill("2026-10-03T10:00:00", 412, invoiceParts({ amount: 412, gst: 62.85, energyAmount: 330 })),
      bill("2026-10-04T10:00:00", 236, invoiceParts({ amount: 236, gst: 36 })),
      bill("2026-10-05T10:00:00", 150, null),
    ];
    const b = spendBreakdown(bills, ALL)!;
    expect(b.supercharger).toEqual([
      { label: "Charging", amount: 480.4 },
      { label: "Idle fee", amount: 20 },
    ]);
    expect(b.invoice).toEqual([
      { label: "Energy", amount: 330 },
      { label: "Fees", amount: 19.15 },
      { label: "Before GST", amount: 200 },
      { label: "GST", amount: 98.85 },
    ]);
    expect(b.unitemised).toBe(150);
    expect(b.total).toBe(1298.4);
    const lines = [...b.supercharger, ...b.invoice].reduce((a, l) => a + Math.round(l.amount * 100), 0) + Math.round(b.unitemised * 100);
    expect(lines).toBe(Math.round(b.total * 100));
  });

  test("parts that don't add up to the bill count as not itemised", () => {
    const b = spendBreakdown([bill("2026-10-01T10:00:00", 500, [{ from: "supercharger", label: "Charging", amount: 480 }]), bill("2026-10-02T10:00:00", 118, invoiceParts({ amount: 118, gst: 18 }))], ALL)!;
    expect(b.supercharger).toEqual([]);
    expect(b.unitemised).toBe(500);
  });

  test("null when nothing in the span is itemised", () => {
    expect(spendBreakdown([bill("2026-10-01T10:00:00", 500, null)], ALL)).toBe(null);
    expect(spendBreakdown([bill("2026-10-01T10:00:00", 118, invoiceParts({ amount: 118, gst: 18 }))], { from: ist("2026-11-01T00:00:00"), to: Infinity })).toBe(null);
  });

  test("chargingBills carries Tesla's lines and the invoice's parts", () => {
    const tesla = [
      { started_at: iso("2026-10-01T10:00:00"), cost_total: 500, energy_kwh: 20, currency: "INR", lines: [{ type: "Charging", amount: 500 }] },
      { started_at: iso("2026-10-02T10:00:00"), cost_total: 300, energy_kwh: 12, currency: "INR" },
    ];
    const stream = [{ id: 7, started_at: iso("2026-10-03T10:00:00"), energy_added_kwh: 18, kind: "dc" as const }];
    const bills = chargingBills(tesla, stream, new Map([[7, { amount: 118, kwhBilled: 19, gst: 18 }]]));
    expect(bills.map((b) => b.parts?.map((p) => p.label) ?? null)).toEqual([["Charging"], null, ["Before GST", "GST"]]);
  });
});

describe("paidFor", () => {
  const bill = (local: string, cost: number, parts: Bill["parts"]): Bill => ({ started_at: iso(local), cost, kwh: 20, kind: "dc", parts });
  const charging = (local: string, amount: number) => bill(local, amount, [{ from: "supercharger", label: "Charging", amount }]);

  test("hidden when every bill is only Charging: it would repeat Spend", () => {
    expect(paidFor([charging("2026-10-01T10:00:00", 264.72), charging("2026-10-05T10:00:00", 300)], ALL)).toBe(null);
  });

  test("hidden for one invoice line on its own", () => {
    expect(paidFor([bill("2026-10-01T10:00:00", 200, [{ from: "invoice", label: "Energy", amount: 200 }])], ALL)).toBe(null);
  });

  test("shown with an idle or congestion fee beside the charging", () => {
    const b = paidFor([bill("2026-10-01T10:00:00", 500, [{ from: "supercharger", label: "Charging", amount: 480 }, { from: "supercharger", label: "Idle fee", amount: 20 }])], ALL);
    expect(b?.supercharger.map((l) => l.label)).toEqual(["Charging", "Idle fee"]);
    const c = paidFor([charging("2026-10-01T10:00:00", 400), bill("2026-10-02T10:00:00", 100, [{ from: "supercharger", label: "Congestion fee", amount: 100 }])], ALL);
    expect(c?.total).toBe(500);
  });

  test("shown when an invoice splits out the GST", () => {
    expect(paidFor([bill("2026-10-01T10:00:00", 118, invoiceParts({ amount: 118, gst: 18 }))], ALL)?.invoice.length).toBe(2);
  });

  test("a bill that isn't itemised counts as a line of its own", () => {
    expect(paidFor([charging("2026-10-01T10:00:00", 400), bill("2026-10-02T10:00:00", 150, null)], ALL)?.unitemised).toBe(150);
  });

  test("only the period's bills count", () => {
    const bills = [charging("2026-10-01T10:00:00", 400), bill("2026-09-02T10:00:00", 120, [{ from: "supercharger", label: "Charging", amount: 100 }, { from: "supercharger", label: "Idle fee", amount: 20 }])];
    expect(paidFor(bills, { from: ist("2026-10-01T00:00:00"), to: ist("2026-11-01T00:00:00") })).toBe(null);
    expect(paidFor(bills, ALL)).not.toBe(null);
  });

  test("null when nothing is itemised", () => {
    expect(paidFor([bill("2026-10-01T10:00:00", 500, null)], ALL)).toBe(null);
  });
});

describe("chargingTime", () => {
  test("Superchargers count as DC, the rest by their own kind, only in the span", () => {
    const at = (local: string, minutes: number) => ({ started_at: iso(local), end: new Date(ist(local) + minutes * 60_000).toISOString() });
    const a = at("2026-10-01T10:00:00", 30);
    const b = at("2026-10-02T10:00:00", 60);
    const c = at("2026-10-03T10:00:00", 45);
    const d = at("2026-09-03T10:00:00", 45);
    const time = chargingTime(
      [{ started_at: a.started_at, stopped_at: a.end }],
      [
        { started_at: b.started_at, ended_at: b.end, kind: "ac" },
        { started_at: c.started_at, ended_at: c.end, kind: "dc" },
        { started_at: d.started_at, ended_at: d.end, kind: "dc" },
        { started_at: c.started_at, ended_at: null, kind: "ac" },
      ],
      { from: ist("2026-10-01T00:00:00"), to: ist("2026-11-01T00:00:00") },
    );
    expect(time).toEqual({ ac: 60 * 60_000, dc: 75 * 60_000 });
  });
});
