import { describe, expect, test } from "bun:test";
import { acSupply, cableLabel, phasesLabel } from "@/lib/ac-charge";
import { carNotices } from "@/lib/car-notices";
import { feeLines } from "@/lib/charge-fees";
import { teslaPack } from "@/lib/tesla-pack";

describe("teslaPack", () => {
  test("the latest figure with its time, and a weekly median", () => {
    const pack = teslaPack({ at: "2026-10-24T10:00:00Z", value: 62.123 }, [
      { at: "2026-10-06T10:00:00Z", value: 62.4 },
      { at: "2026-10-07T10:00:00Z", value: "62.6" },
      { at: "2026-10-14T10:00:00Z", value: 62.2 },
      { at: "2026-10-15T10:00:00Z", value: null },
    ]);
    expect(pack?.kwh).toBe(62.1);
    expect(pack?.at).toBe("2026-10-24T10:00:00Z");
    expect(pack?.weekly.map((w) => w.kwh)).toEqual([62.5, 62.2]);
  });
  test("nothing without a usable latest figure", () => {
    expect(teslaPack(undefined, [])).toBeNull();
    expect(teslaPack({ at: "2026-10-24T10:00:00Z", value: 0 }, [])).toBeNull();
    expect(teslaPack({ at: "2026-10-24T10:00:00Z", value: "n/a" }, [])).toBeNull();
  });
});

describe("carNotices", () => {
  test("only what Tesla said true", () => {
    expect(carNotices({ supercharger_payment_needed: true, in_service: true })).toEqual([
      "Tesla shows an unpaid Supercharger balance.",
      "The car is at a Tesla service centre.",
    ]);
    expect(carNotices({ supercharger_payment_needed: false, in_service: "true" })).toEqual([]);
    expect(carNotices({})).toEqual([]);
    expect(carNotices(null)).toEqual([]);
  });
});

describe("acSupply", () => {
  test("what the car reported, rounded", () => {
    expect(acSupply({ ac_voltage: "229.6", ac_amps: 15.8, ac_phases: 3, cable_type: "IEC" })).toEqual({
      volts: 230,
      amps: 16,
      phases: 3,
      cable: { name: "Type 2", standard: "IEC" },
    });
  });
  test("unknown phases and cables are left out; nothing known is null", () => {
    expect(acSupply({ ac_voltage: 230, ac_amps: null, ac_phases: 2, cable_type: "MYSTERY" })).toEqual({ volts: 230, amps: null, phases: null, cable: null });
    expect(acSupply({ ac_voltage: null, ac_amps: 0, ac_phases: null, cable_type: null })).toBeNull();
  });
  test("labels", () => {
    expect(cableLabel("SAE")).toBe("J1772 (SAE)");
    expect(cableLabel(3)).toBeNull();
    expect(phasesLabel(1)).toBe("Single-phase");
    expect(phasesLabel("3")).toBe("Three-phase");
    expect(phasesLabel(2)).toBeNull();
  });
});

describe("feeLines", () => {
  const charging = { feeType: "CHARGING", currencyCode: "INR", usageBase: "32.4", totalDue: 777.6, uom: "kwh" };
  test("each readable line, named and with its unit", () => {
    const fees = feeLines([charging, { feeType: "PARKING", currencyCode: "INR", usageBase: 6, totalDue: 120, uom: "min" }], 897.6);
    expect(fees).toEqual({
      lines: [
        { type: "Charging", quantity: 32.4, unit: "kWh", amount: 777.6, currency: "INR" },
        { type: "Idle fee", quantity: 6, unit: "min", amount: 120, currency: "INR" },
      ],
      skipped: 0,
      addsUp: true,
    });
  });
  test("zero lines are dropped; unknown types in Tesla's words; unreadable lines skipped and flagged", () => {
    const fees = feeLines(
      [charging, { feeType: "PARKING", usageBase: 0, totalDue: 0, uom: "min" }, { feeType: "SITE_ACCESS", totalDue: "50" }, { totalDue: 10 }, "junk", { feeType: "CHARGING", totalDue: "abc" }],
      837.6,
    );
    expect(fees?.lines.map((l) => [l.type, l.quantity, l.unit, l.amount])).toEqual([
      ["Charging", 32.4, "kWh", 777.6],
      ["Site access", null, null, 50],
    ]);
    expect(fees?.skipped).toBe(3);
    expect(fees?.addsUp).toBe(false);
  });
  test("a quantity without a unit isn't shown; nothing readable is null", () => {
    expect(feeLines([{ feeType: "CHARGING", usageBase: 10, totalDue: 5 }], 5)?.lines[0]).toEqual({ type: "Charging", quantity: null, unit: null, amount: 5, currency: null });
    expect(feeLines([], null)).toBeNull();
    expect(feeLines({ fees: [] }, null)).toBeNull();
    expect(feeLines([{ nothing: true }], null)).toBeNull();
  });
});
