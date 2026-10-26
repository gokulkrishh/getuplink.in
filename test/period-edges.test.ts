import { describe, expect, test } from "bun:test";
import { urlRange } from "@/components/stats/periods";
import { knownBar } from "@/components/stats/driving-sections";
import { chargeTotals } from "@/lib/charging-figures";
import type { Drive } from "@/lib/drives";
import { monthlyRows } from "@/lib/monthly";
import { isoDay, parseRange, previousLabel, previousSpan, rangeSlots, slotsFor } from "@/lib/periods";
import { seasonTimeframe } from "@/lib/seasons";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("dates that don't exist", () => {
  test("isoDay refuses a day past the month's end instead of rolling it over", () => {
    expect(isoDay("2026-02-30")).toBeNull();
    expect(isoDay("2026-04-31")).toBeNull();
    expect(isoDay("2027-02-29")).toBeNull();
    expect(isoDay("2028-02-29")).not.toBeNull();
    expect(isoDay("2026-12-31")).not.toBeNull();
  });
  test("so a Custom range or a URL with one is not a range", () => {
    expect(parseRange("2026-02-30", "2026-03-10", ist("2026-10-25T12:00:00"))).toBeNull();
    expect(urlRange("2026-02-30", "2026-03-10")).toBeNull();
  });
});

describe("to date at exactly IST midnight on the 1st", () => {
  test("month: the span before is empty and named for its first day, not the month before it", () => {
    const now = ist("2026-11-01T00:00:00");
    expect(previousSpan("month", now)).toEqual({ from: ist("2026-10-01T00:00:00"), to: ist("2026-10-01T00:00:00") });
    expect(previousLabel("month", now)).toBe("1 Oct");
  });
  test("year: 1 Jan of last year, never a span that runs backwards", () => {
    expect(previousLabel("year", ist("2027-01-01T00:00:00"))).toBe("1 Jan 2026");
  });
});

describe("slots ahead of now", () => {
  const now = ist("2026-10-22T14:00:00");
  test("year: November and December are ahead, October and before are not", () => {
    const ahead = slotsFor("year", now).map((s) => s.ahead);
    expect(ahead).toEqual([false, false, false, false, false, false, false, false, false, false, true, true]);
  });
  test("day: the hours after this one are ahead", () => {
    const ahead = slotsFor("day", now).map((s) => s.ahead);
    expect(ahead).toEqual([...Array(15).fill(false), ...Array(9).fill(true)]);
  });
  test("month: the days after today are ahead", () => {
    expect(slotsFor("month", now).filter((s) => s.ahead)).toHaveLength(9);
  });
  test("week and all end with now's slot, so none is ahead", () => {
    for (const period of ["week", "all"] as const) expect(slotsFor(period, now).some((s) => s.ahead)).toBe(false);
  });
  test("a range reaching today: only the hours after now", () => {
    const { slots } = rangeSlots({ from: isoDay("2026-10-21")!, to: isoDay("2026-10-22")! }, now);
    expect(slots.filter((s) => s.ahead)).toHaveLength(9);
  });
  test("seasons stop at this month", () => {
    expect(seasonTimeframe(now).slots.some((s) => s.ahead)).toBe(false);
  });
});

describe("knownBar", () => {
  const [past, , future] = slotsFor("year", ist("2026-10-22T14:00:00")).slice(9);
  const format = (n: number) => String(n);
  test("a slot ahead of now is blank, never 0", () => {
    expect(knownBar(future, 0, format)).toMatchObject({ blank: true, display: "" });
  });
  test("an unknown figure is blank; a known 0 is drawn as 0", () => {
    expect(knownBar(past, null, format)).toMatchObject({ blank: true, display: "" });
    expect(knownBar(past, 0, format)).toMatchObject({ blank: false, value: 0, display: "0" });
    expect(knownBar(past, 46, format)).toMatchObject({ blank: false, value: 46, display: "46" });
  });
});

describe("chargeTotals", () => {
  test("a charge with no bill is counted apart, not as ₹0 spent", () => {
    // 25 Oct 2026: one DC charge, 14.56 kWh, no invoice.
    expect(chargeTotals([{ kwh: 14.56, cost: null }])).toEqual({ kwh: 14.56, cost: 0, unbilled: 1 });
  });
  test("energy is unknown when any charge has no figure", () => {
    expect(chargeTotals([{ kwh: 10, cost: 300 }, { kwh: null, cost: null }]).kwh).toBeNull();
    expect(chargeTotals([])).toEqual({ kwh: 0, cost: 0, unbilled: 0 });
  });
});

describe("monthlyRows cut by from", () => {
  const drive = (at: string, km: number): Drive => ({ start: ist(at), end: ist(at) + 30 * 60_000, km, kwh: null, whPerKm: null, startLevel: null, endLevel: null });
  const charge = (at: string, kwh: number) => ({ started_at: new Date(ist(at)).toISOString(), kwh, cost: 500 });
  test("the oldest month counts drives and charges over the same days", () => {
    // The 90-day edge on 27 Oct: a charge on 5 Oct falls before it, like the drive it would go with.
    const rows = monthlyRows([drive("2026-10-05T10:00:00", 30), drive("2026-10-28T10:00:00", 12)], [charge("2026-10-05T12:00:00", 20), charge("2026-10-29T12:00:00", 8)], ist("2026-10-27T00:00:00"), ist("2026-11-05T12:00:00"));
    const oct = rows.at(-1)!;
    expect([oct.km, oct.charges, oct.kwhAdded, oct.spend]).toEqual([12, 1, 8, 500]);
  });
});
