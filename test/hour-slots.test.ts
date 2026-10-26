import { describe, expect, test } from "bun:test";
import { barsCaption } from "@/components/stats/chart-caption";
import { formatHours } from "@/lib/format";
import { isoDay, periodTimeframe, rangeSlots, rangeTimeframe } from "@/lib/periods";

const ist = (local: string) => Date.parse(`${local}+05:30`);

// A bar that covers hours says its whole span, so a 7:14 AM trip in the 6 AM to 9 AM bar never reads as
// "drove at 6 AM".
describe("slots of hours", () => {
  const now = ist("2026-10-25T14:00:00");
  const day = (local: string) => isoDay(local)!;

  test("formatHours writes both ends in full, 12-hour", () => {
    expect(formatHours(6, 9)).toBe("6 AM to 9 AM");
    expect(formatHours(9, 12)).toBe("9 AM to 12 PM");
    expect(formatHours(21, 24)).toBe("9 PM to 12 AM");
    expect(formatHours(0, 3)).toBe("12 AM to 3 AM");
  });

  test("a one-day range has the Day period's blocks", () => {
    const { slots } = rangeSlots({ from: day("2026-10-24"), to: day("2026-10-24") }, now);
    expect(slots).toHaveLength(8);
    expect(slots[2]).toMatchObject({ label: "6 AM to 9 AM", axis: "6 AM", edge: true, from: ist("2026-10-24T06:00:00"), to: ist("2026-10-24T09:00:00") });
  });

  test("a two-day range names the day in every label, and on the axis at each midnight", () => {
    const { slots, slotName } = rangeSlots({ from: day("2026-10-24"), to: day("2026-10-25") }, now);
    expect(slotName).toBe("3 hours");
    expect(slots).toHaveLength(16);
    expect(slots[0]).toMatchObject({ label: "Sat, 12 AM to 3 AM", axis: "Sat", from: ist("2026-10-24T00:00:00") });
    expect(slots[2]).toMatchObject({ label: "Sat, 6 AM to 9 AM", axis: "6 AM" });
    expect(slots[8]).toMatchObject({ label: "Sun, 12 AM to 3 AM", axis: "Sun", from: ist("2026-10-25T00:00:00") });
    expect(slots[15]).toMatchObject({ label: "Sun, 9 PM to 12 AM", axis: "9 PM", ahead: true });
    expect(slots.find((s) => s.isCurrent)!.label).toBe("Sun, 12 PM to 3 PM");
  });

  test("longer ranges and other periods keep centred labels", () => {
    expect(rangeSlots({ from: day("2026-10-19"), to: day("2026-10-25") }, now).slots.some((s) => s.edge || s.axis)).toBe(false);
    expect(periodTimeframe("week", now).slots.some((s) => s.edge)).toBe(false);
  });

  test("captions say what each bar covers", () => {
    expect(barsCaption("Kilometres driven", periodTimeframe("day", now))).toBe("Kilometres driven in each 3-hour block today, 12 AM to 12 AM");
    expect(barsCaption("Bills", rangeTimeframe({ from: day("2026-10-24"), to: day("2026-10-24") }, now))).toBe("Bills in each 3-hour block on 24 Oct, 12 AM to 12 AM");
    expect(barsCaption("Energy added", rangeTimeframe({ from: day("2026-10-24"), to: day("2026-10-25") }, now))).toBe("Energy added in each 3-hour block from 24 Oct to 25 Oct");
    expect(barsCaption("Kilometres driven", periodTimeframe("week", now))).toBe("Kilometres driven each day, last 7 days");
  });
});
