import { expect, test } from "bun:test";
import { consumptionIn } from "@/lib/drive-stats";
import type { Drive } from "@/lib/drives";

const drive = (start: number, km: number, kwh: number | null) => ({ start, end: start + 3_600_000, km, kwh, hourKm: [{ from: start, km }] }) as unknown as Drive;

test("the average over the drives in a span, with the distance it rests on", () => {
  const drives = [drive(0, 40, 5), drive(10 * 3_600_000, 20, 3)];
  expect(consumptionIn(drives, { from: 0, to: 20 * 3_600_000 })).toEqual({ whPerKm: (8 * 1000) / 60, km: 60 });
  expect(consumptionIn(drives, { from: 5 * 3_600_000, to: 20 * 3_600_000 })).toEqual({ whPerKm: 150, km: 20 });
});

test("too little driving, or no energy figure, gives nothing", () => {
  expect(consumptionIn([drive(0, 5, 1)], { from: 0, to: 3_600_000 })).toBeNull();
  expect(consumptionIn([drive(0, 40, null)], { from: 0, to: 3_600_000 })).toBeNull();
});
