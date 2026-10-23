import { describe, expect, test } from "bun:test";
import type { Drive } from "@/lib/drives";
import { monthlyRows } from "@/lib/monthly";

const ist = (local: string) => Date.parse(`${local}+05:30`);
const drive = (at: string, km: number, kwh: number | null): Drive => ({ start: ist(at), end: ist(at) + 30 * 60_000, km, kwh, whPerKm: null, startLevel: null, endLevel: null });

describe("monthlyRows", () => {
  const now = ist("2026-11-05T12:00:00");
  const rows = monthlyRows(
    [drive("2026-10-23T10:54:00", 40, 8.3), drive("2026-11-02T09:00:00", 12, null)],
    [
      { started_at: new Date(ist("2026-10-25T20:00:00")).toISOString(), kwh: 30, cost: 600 },
      { started_at: new Date(ist("2026-11-01T21:00:00")).toISOString(), kwh: 20, cost: null },
    ],
    ist("2026-08-01T00:00:00"),
    now,
  );
  test("newest month first, from the first month with data", () => {
    expect(rows.map((r) => r.charges)).toEqual([1, 1]);
  });
  test("sums each month, spend from bills only", () => {
    const [nov, oct] = rows;
    expect([oct.km, oct.kwhUsed, oct.kwhAdded, oct.spend, oct.unbilled]).toEqual([40, 8.3, 30, 600, 0]);
    expect([nov.km, nov.kwhUsed, nov.spend, nov.unbilled]).toEqual([12, null, 0, 1]);
    expect(oct.drivingMs).toBe(30 * 60_000);
  });
});
