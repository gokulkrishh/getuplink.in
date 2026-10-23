import { describe, expect, test } from "bun:test";
import { chargeStarts, istSlot, istWeekday, slotLabel } from "@/lib/charge-habits";

const ist = (local: string) => Date.parse(`${local}+05:30`);

describe("charge habits", () => {
  test("weekday and slot in IST", () => {
    // 23 Oct 2026 is a Friday.
    expect(istWeekday(ist("2026-10-23T19:30:00"))).toBe(4);
    expect(istSlot(ist("2026-10-23T19:30:00"))).toBe(6);
    // 00:30 IST is still Friday's small hours, not Thursday UTC.
    expect(istWeekday(ist("2026-10-23T00:30:00"))).toBe(4);
    expect(istSlot(ist("2026-10-23T00:30:00"))).toBe(0);
  });
  test("counts per weekday and slot", () => {
    const counts = chargeStarts([ist("2026-10-23T19:30:00"), ist("2026-10-30T20:10:00"), ist("2026-10-24T07:00:00")]);
    expect(counts[4][6]).toBe(2);
    expect(counts[5][2]).toBe(1);
  });
  test("slot labels say the shared AM or PM once", () => {
    expect(slotLabel(6)).toBe("6 to 9 PM");
    expect(slotLabel(3)).toBe("9 AM to 12 PM");
    expect(slotLabel(7)).toBe("9 PM to 12 AM");
  });
});
