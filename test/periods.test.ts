import { describe, expect, test } from "bun:test";
import { barOpens } from "@/components/stats/bar-parts";
import { energyBySlot, energyIn, firstStartedAt } from "@/lib/charging-figures";
import { changeToPrevious, compareToPrevious } from "@/lib/dashboard-summary";
import { formatShortDate } from "@/lib/format";
import { dayIso, defaultRange, inSpan, isoDay, monthIndex, monthShort, monthStart, parseRange, periodSpan, previousLabel, previousSpan, rangeSlots, rangeSpan, rangeTimeframe, slotsFor, sumBySlot, trackingGap } from "@/lib/periods";
import { istDayStart } from "@/lib/telemetry-derive";

// An instant given as IST wall-clock time.
const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("months in IST", () => {
  test("the month turns at IST midnight, not UTC", () => {
    expect(monthIndex(ist("2026-09-30T23:59:59"))).toBe(2026 * 12 + 8);
    expect(monthIndex(ist("2026-10-01T00:00:00"))).toBe(2026 * 12 + 9);
    expect(monthStart(2026 * 12 + 9)).toBe(ist("2026-10-01T00:00:00"));
  });
  test("January follows December", () => {
    expect(monthStart(2027 * 12)).toBe(ist("2027-01-01T00:00:00"));
    expect(monthIndex(ist("2026-12-31T23:59:59"))).toBe(2026 * 12 + 11);
  });
});

describe("periodSpan", () => {
  const now = ist("2026-10-22T14:00:00");
  test("week is the last 7 IST days, today included", () => {
    expect(periodSpan("week", now)).toEqual({ from: ist("2026-10-16T00:00:00"), to: Infinity });
  });
  test("month and year start at IST midnight", () => {
    expect(periodSpan("month", now).from).toBe(ist("2026-10-01T00:00:00"));
    expect(periodSpan("year", now).from).toBe(ist("2026-01-01T00:00:00"));
  });
  test("all has no start", () => {
    expect(periodSpan("all", now).from).toBe(-Infinity);
  });
});

describe("previousSpan, to date", () => {
  test("week: the 7 full days before", () => {
    const now = ist("2026-10-22T14:00:00");
    expect(previousSpan("week", now)).toEqual({ from: ist("2026-10-09T00:00:00"), to: ist("2026-10-16T00:00:00") });
    expect(previousLabel("week", now)).toBe("the 7 days before");
  });
  test("month: as far into last month as now is into this one", () => {
    const now = ist("2026-10-22T14:00:00");
    expect(previousSpan("month", now)).toEqual({ from: ist("2026-09-01T00:00:00"), to: ist("2026-09-22T14:00:00") });
    expect(previousLabel("month", now)).toBe(`1 to ${formatShortDate(ist("2026-09-22T12:00:00"))}`);
  });
  test("month: 31 Oct takes all of September, not into October", () => {
    const now = ist("2026-10-31T20:00:00");
    expect(previousSpan("month", now)).toEqual({ from: ist("2026-09-01T00:00:00"), to: ist("2026-10-01T00:00:00") });
    expect(previousLabel("month", now)).toBe(`1 to ${formatShortDate(ist("2026-09-30T12:00:00"))}`);
  });
  test("month: 31 Mar takes all of a 28-day February", () => {
    expect(previousLabel("month", ist("2027-03-31T09:00:00"))).toBe("1 to 28 Feb");
  });
  test("month: 30 Mar in a leap year takes all 29 days of February", () => {
    expect(previousLabel("month", ist("2028-03-30T09:00:00"))).toBe("1 to 29 Feb");
  });
  test("month: on the 1st it is one day", () => {
    expect(previousLabel("month", ist("2026-11-01T08:00:00"))).toBe("1 Oct");
  });
  test("year: 29 Feb of a leap year compares the same elapsed time a year before", () => {
    const now = ist("2028-02-29T14:00:00");
    const span = previousSpan("year", now)!;
    expect(span.from).toBe(ist("2027-01-01T00:00:00"));
    expect(span.to - span.from).toBe(now - ist("2028-01-01T00:00:00"));
    expect(previousLabel("year", now)).toBe("1 Jan to 1 Mar 2027");
  });
  test("year: on 1 Jan it is one day of last year", () => {
    expect(previousSpan("year", ist("2027-01-01T05:00:00"))).toEqual({ from: ist("2026-01-01T00:00:00"), to: ist("2026-01-01T05:00:00") });
    expect(previousLabel("year", ist("2027-01-01T05:00:00"))).toBe("1 Jan 2026");
  });
  test("year: a year to date", () => {
    expect(previousLabel("year", ist("2026-10-22T14:00:00"))).toBe("1 Jan to 22 Oct 2025");
  });
  test("all has nothing to compare with", () => {
    expect(previousSpan("all", ist("2026-10-22T14:00:00"))).toBeNull();
    expect(previousLabel("all", ist("2026-10-22T14:00:00"))).toBeNull();
  });
});

describe("slotsFor", () => {
  const now = ist("2026-10-22T14:00:00");
  test("week: 7 IST days ending today, by weekday", () => {
    const slots = slotsFor("week", now);
    expect(slots).toHaveLength(7);
    expect(slots[0].from).toBe(ist("2026-10-16T00:00:00"));
    expect(slots[6]).toMatchObject({ from: ist("2026-10-22T00:00:00"), to: ist("2026-10-23T00:00:00"), label: "Thu", isCurrent: true });
    expect(slots.filter((s) => s.isCurrent)).toHaveLength(1);
  });
  test("month: every day of this month, the rest of it ahead", () => {
    const slots = slotsFor("month", now);
    expect(slots).toHaveLength(31);
    expect(slots[0]).toMatchObject({ from: ist("2026-10-01T00:00:00"), to: ist("2026-10-02T00:00:00") });
    expect(slots[30].to).toBe(ist("2026-11-01T00:00:00"));
    expect(slots.findIndex((s) => s.isCurrent)).toBe(21);
    expect(slots.filter((s) => s.ahead)).toHaveLength(9);
  });
  test("year: January to December of this year", () => {
    const slots = slotsFor("year", now);
    expect(slots).toHaveLength(12);
    expect(slots[0].from).toBe(ist("2026-01-01T00:00:00"));
    expect(slots[11].to).toBe(ist("2027-01-01T00:00:00"));
    expect(slots[9].isCurrent).toBe(true);
  });
  test("all: 6 years ending with this one", () => {
    expect(slotsFor("all", now).map((s) => s.label)).toEqual(["2021", "2022", "2023", "2024", "2025", "2026"]);
  });
  test("an item at IST midnight belongs to the day it starts", () => {
    const slots = slotsFor("week", now);
    const items = [{ at: ist("2026-10-21T23:59:00"), v: 1 }, { at: ist("2026-10-22T00:00:00"), v: 10 }, { at: ist("2026-10-01T00:00:00"), v: 100 }];
    expect(sumBySlot(items, slots, (i) => i.at, (i) => i.v)).toEqual([0, 0, 0, 0, 0, 1, 10]);
    expect(inSpan(ist("2026-10-16T00:00:00"), periodSpan("week", now))).toBe(true);
    expect(inSpan(ist("2026-10-15T23:59:59"), periodSpan("week", now))).toBe(false);
  });
});

describe("changeToPrevious", () => {
  test("gives the direction and the rounded amount with its unit", () => {
    expect(changeToPrevious(842, 746, "km")).toEqual({ direction: "up", amount: "96 km", word: "more", tone: "neutral" });
    expect(changeToPrevious(3120, 3530, (n) => `₹${n}`)).toEqual({ direction: "down", amount: "₹410", word: "less", tone: "neutral" });
  });
  test("within 2% is the same", () => {
    expect(changeToPrevious(186, 184, "kWh")?.direction).toBe("same");
  });
  test("lower is better: down is better", () => {
    expect(changeToPrevious(158, 162, "Wh/km", { lowerIsBetter: true })).toEqual({ direction: "down", amount: "4 Wh/km", word: "better", tone: "better" });
    expect(changeToPrevious(170, 158, "Wh/km", { lowerIsBetter: true })).toMatchObject({ direction: "up", word: "worse" });
  });
  test("null without a previous figure", () => {
    expect(changeToPrevious(10, null, "km")).toBeNull();
  });
});

describe("energyBySlot", () => {
  test("adds billed and streamed kWh per slot, like energyIn", () => {
    const now = ist("2026-10-22T12:00:00");
    const slots = slotsFor("week", now);
    const billed = [
      { started_at: "2026-10-22T03:00:00Z", cost_total: 100, energy_kwh: 20, currency: "INR" },
      { started_at: "2026-10-21T03:00:00Z", cost_total: 50, energy_kwh: null, currency: "INR" },
    ];
    const streamed = [
      { started_at: "2026-10-22T05:00:00Z", energy_added_kwh: 5 },
      { started_at: "2026-10-01T05:00:00Z", energy_added_kwh: 9 },
    ];
    expect(energyBySlot(billed, streamed, slots)).toEqual([0, 0, 0, 0, 0, 0, 25]);
  });
});

describe("compareToPrevious", () => {
  test("names the span it compares with", () => {
    expect(compareToPrevious(842, 746, "km", "1–22 Oct")).toEqual({ text: "96 km more than 1–22 Oct", tone: "neutral" });
  });
  test("within 2% is the same", () => {
    expect(compareToPrevious(186, 184, "kWh", "the 7 days before")).toEqual({ text: "Same as the 7 days before", tone: "neutral" });
  });
  test("lower is better words it as better or worse", () => {
    expect(compareToPrevious(158, 162, "Wh/km", "1–22 Oct", { lowerIsBetter: true })).toEqual({ text: "4 Wh/km better than 1–22 Oct", tone: "better" });
    expect(compareToPrevious(170, 158, "Wh/km", "1–22 Oct", { lowerIsBetter: true })?.tone).toBe("worse");
  });
  test("a formatter puts the unit where it belongs", () => {
    expect(compareToPrevious(3120, 3530, (n) => `₹${n}`, "1–22 Oct")?.text).toBe("₹410 less than 1–22 Oct");
  });
  test("null without a previous figure", () => {
    expect(compareToPrevious(10, null, "km", "1–22 Oct")).toBeNull();
  });
});

describe("energyIn", () => {
  const span = { from: ist("2026-10-01T00:00:00"), to: Infinity };
  const tesla = [
    { started_at: "2026-10-10T05:00:00Z", cost_total: 1012, energy_kwh: 42, currency: "INR" },
    { started_at: "2026-09-20T05:00:00Z", cost_total: 900, energy_kwh: 40, currency: "INR" },
  ];
  const streamOnly = [
    { started_at: "2026-10-12T05:00:00Z", energy_added_kwh: 30.1 },
    { started_at: "2026-10-15T05:00:00Z", energy_added_kwh: null },
  ];
  test("energy from Tesla's sessions and the car's own", () => {
    expect(energyIn(tesla, streamOnly, span)).toBeCloseTo(72.1, 6);
  });
  test("charging tracking begins at the first session of either kind", () => {
    expect(firstStartedAt(tesla, streamOnly)).toBe(Date.parse("2026-09-20T05:00:00Z"));
    expect(firstStartedAt([], [{ started_at: "2026-10-12T05:00:00Z" }])).toBe(Date.parse("2026-10-12T05:00:00Z"));
    expect(firstStartedAt([], [])).toBeNull();
  });
});

describe("trackingGap", () => {
  const before = { from: ist("2025-01-01T00:00:00"), to: ist("2025-10-22T14:00:00") };
  test("the earliest tracking that began after the span before started", () => {
    expect(trackingGap(before, [ist("2025-12-30T10:00:00"), ist("2026-01-09T10:00:00")])).toBe(ist("2025-12-30T10:00:00"));
  });
  test("tracking from before the span, or none at all, leaves no gap", () => {
    expect(trackingGap(before, [ist("2024-12-01T00:00:00"), null])).toBeNull();
    expect(trackingGap(before, [ist("2024-12-01T00:00:00"), ist("2025-03-01T00:00:00")])).toBe(ist("2025-03-01T00:00:00"));
  });
  test("All has no span before", () => {
    expect(trackingGap(null, [ist("2026-01-09T10:00:00")])).toBeNull();
  });
});

describe("the Day period", () => {
  const now = Date.parse("2026-10-23T14:00:00+05:30");
  test("today from IST midnight, compared with all of yesterday, in hourly bars", () => {
    expect(periodSpan("day", now).from).toBe(Date.parse("2026-10-23T00:00:00+05:30"));
    expect(previousSpan("day", now)).toEqual({ from: Date.parse("2026-10-22T00:00:00+05:30"), to: Date.parse("2026-10-23T00:00:00+05:30") });
    expect(previousLabel("day", now)).toBe("yesterday");
    const slots = slotsFor("day", now);
    expect(slots).toHaveLength(24);
    expect(slots.slice(0, 3).map((s) => s.label)).toEqual(["12 AM to 1 AM", "1 AM to 2 AM", "2 AM to 3 AM"]);
    expect(slots[7]).toMatchObject({ label: "7 AM to 8 AM", axis: "7 AM", from: ist("2026-10-23T07:00:00"), to: ist("2026-10-23T08:00:00") });
    expect(slots[23].label).toBe("11 PM to 12 AM");
    expect(slots.every((s) => s.edge)).toBe(true);
    expect(slots.find((s) => s.isCurrent)!.label).toBe("2 PM to 3 PM");
  });
});

describe("custom ranges", () => {
  const now = ist("2026-10-25T14:00:00");
  const day = (local: string) => isoDay(local)!;

  test("a date input's day is the IST day it names", () => {
    expect(istDayStart(day("2026-10-25"))).toBe(ist("2026-10-25T00:00:00"));
    expect(dayIso(day("2026-10-25"))).toBe("2026-10-25");
    expect(isoDay("2026-13-40")).toBeNull();
    expect(isoDay("25/10/2026")).toBeNull();
  });
  test("parseRange keeps to today, puts the earlier day first and needs both", () => {
    expect(parseRange("2026-10-30", "2026-10-01", now)).toEqual({ from: day("2026-10-01"), to: day("2026-10-25") });
    expect(parseRange("2026-10-01", undefined, now)).toBeNull();
    expect(defaultRange(now)).toEqual({ from: day("2026-09-26"), to: day("2026-10-25") });
  });
  test("a range reaching today runs on, like a period; a past one ends after its last day", () => {
    expect(rangeSpan({ from: day("2026-10-20"), to: day("2026-10-25") }, now)).toEqual({ from: ist("2026-10-20T00:00:00"), to: Infinity });
    expect(rangeSpan({ from: day("2026-09-01"), to: day("2026-09-30") }, now)).toEqual({ from: ist("2026-09-01T00:00:00"), to: ist("2026-10-01T00:00:00") });
  });
  test("it is compared with as many days right before", () => {
    const sept = rangeTimeframe({ from: day("2026-09-01"), to: day("2026-09-30") }, now);
    expect(sept.previous).toEqual({ from: ist("2026-08-02T00:00:00"), to: ist("2026-09-01T00:00:00") });
    expect(sept.previousLabel).toBe(`${formatShortDate(ist("2026-08-02T12:00:00"))} to ${formatShortDate(ist("2026-08-31T12:00:00"))}`);
    expect(sept.words).toBe(`from ${formatShortDate(ist("2026-09-01T12:00:00"))} to ${formatShortDate(ist("2026-09-30T12:00:00"))}`);
  });
  test("bars fit the range's length", () => {
    const slots = (from: string, to: string) => rangeSlots({ from: day(from), to: day(to) }, now);
    expect(slots("2026-10-24", "2026-10-25").slots).toHaveLength(48);
    expect(slots("2026-10-24", "2026-10-25").slotName).toBe("hour");
    const days = slots("2026-09-26", "2026-10-25");
    expect(days.slots).toHaveLength(30);
    expect(days.labelEvery).toBe(7);
    expect(days.slots.at(-1)!.isCurrent).toBe(true);
    const months = slots("2026-03-15", "2026-10-25");
    expect(months.slotName).toBe("month");
    expect(months.slots).toHaveLength(8);
    // The first month counts only from the range's first day.
    expect(months.slots[0].from).toBe(ist("2026-03-15T00:00:00"));
    expect(slots("2020-01-01", "2026-10-25").slotName).toBe("year");
  });
});

describe("what a bar opens", () => {
  const now = ist("2026-10-26T14:00:00");
  test("a day's bar names its IST day, titled in full", () => {
    const week = slotsFor("week", now);
    expect(week[0].days).toEqual({ kind: "day", from: "2026-10-20", to: "2026-10-20", title: "Tue, 20 Oct" });
    expect(week[6].days).toEqual({ kind: "day", from: "2026-10-26", to: "2026-10-26", title: "Mon, 26 Oct" });
  });
  test("a month's bar covers its days up to today; months ahead open nothing", () => {
    const year = slotsFor("year", now);
    expect(year[8].days).toEqual({ kind: "month", from: "2026-09-01", to: "2026-09-30", title: `${monthShort(monthIndex(ist("2026-09-15T12:00:00")))} 2026` }); // "Sep" or "Sept", by ICU version
    expect(year[9].days).toEqual({ kind: "month", from: "2026-10-01", to: "2026-10-26", title: "Oct 2026" });
    expect(year[10].days).toBeUndefined();
  });
  test("a year's bar covers its days; a bar of hours opens nothing", () => {
    expect(slotsFor("all", now)[5].days).toEqual({ kind: "year", from: "2026-01-01", to: "2026-10-26", title: "2026" });
    expect(slotsFor("day", now).every((s) => s.days === undefined)).toBe(true);
    expect(rangeSlots({ from: isoDay("2026-10-25")!, to: isoDay("2026-10-26")! }, now).slots.every((s) => s.days === undefined)).toBe(true);
  });
  test("a range's month bar covers only its part of the month", () => {
    const { slots } = rangeSlots({ from: isoDay("2026-08-15")!, to: isoDay("2026-10-10")! }, now);
    expect(slots[0].days).toEqual({ kind: "month", from: "2026-08-15", to: "2026-08-31", title: "Aug 2026" });
    expect(slots[2].days).toEqual({ kind: "month", from: "2026-10-01", to: "2026-10-10", title: "Oct 2026" });
  });
  test("a day, month or year opens its days as the Stats page's Custom range; a day on Driving when none is named", () => {
    expect(barOpens({ kind: "day", from: "2026-10-20", to: "2026-10-20", title: "Tue, 20 Oct" })).toEqual({ href: "/stats/driving?period=custom&from=2026-10-20&to=2026-10-20", label: "Open 20 Oct's drives" });
    expect(barOpens({ kind: "month", from: "2026-09-01", to: "2026-09-30", title: "Sept 2026" }, "charging")).toEqual({
      href: "/stats/charging?period=custom&from=2026-09-01&to=2026-09-30",
      label: "Open Sept 2026",
    });
    expect(barOpens({ kind: "year", from: "2026-01-01", to: "2026-10-26", title: "2026" }, "driving")).toEqual({
      href: "/stats/driving?period=custom&from=2026-01-01&to=2026-10-26",
      label: "Open 2026",
    });
    expect(barOpens({ kind: "month", from: "2026-09-01", to: "2026-09-30", title: "Sep 2026" })).toBeNull();
    expect(barOpens(undefined, "driving")).toBeNull();
  });
});
