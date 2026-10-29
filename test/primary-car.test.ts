import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Owner } from "@/lib/server/data/owner";
import { FakeDb, type Row } from "./fake-db";

// Which car an owner's Stats follow, and which cars the daily archive covers, after the owner sells car A
// and buys car B on the same Tesla account. Made-up VINs.

let fake: FakeDb;

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));

const { loadPrimaryVehicle } = await import("@/lib/server/telemetry");
const { archiveOwnerDrives } = await import("@/lib/server/drive-archive");

const owner = { userId: 1, sub: "made-up-1" } as unknown as Owner;
const SOLD = "TESTVIN0000000SOLDA";
const BOUGHT = "TESTVIN000000BOUGHT";
const H = 3_600_000;
const NOW = Date.parse("2026-10-29T12:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

const car = (id: number, vin: string, createdAt: string, until: string | null): Row => ({
  id,
  user_id: 1,
  vin,
  created_at: createdAt,
  readings_from: createdAt,
  readings_until: until,
});
const sold = car(100, SOLD, "2026-01-01T00:00:00Z", "2026-10-01T00:00:00Z");
const bought = car(200, BOUGHT, "2026-10-02T00:00:00Z", null);

// One drive yesterday in car B: gear D to P, the odometer either side, speed and location while moving.
function driveReadings(vin: string): Row[] {
  const start = NOW - 30 * H;
  const end = NOW - 29 * H;
  const rows: Row[] = [];
  const add = (t: number, field: string, value: unknown) => rows.push({ vin, field, created_at: iso(t), value });
  add(start - 10 * H, "Gear", "ShiftStateP");
  add(start, "Gear", "ShiftStateD");
  add(end, "Gear", "ShiftStateP");
  add(start - 60_000, "Odometer", 1000);
  add(end + 60_000, "Odometer", 1020);
  for (let t = start; t < end; t += 10_000) {
    add(t, "VehicleSpeed", 30);
    add(t, "Location", { latitude: 12.9, longitude: 77.6 });
  }
  return rows;
}

beforeEach(() => {
  fake = new FakeDb({ vehicles: [{ ...sold }, { ...bought }], telemetry_readings: driveReadings(BOUGHT), drive_archive: [] });
});

describe("loadPrimaryVehicle", () => {
  test("after a car is sold and another bought, Stats follow the car still on the account", async () => {
    expect((await loadPrimaryVehicle(owner))?.vin).toBe(BOUGHT);
  });

  test("with no car still on the account, the oldest car with a VIN, as before", async () => {
    fake.tables.vehicles = [{ ...sold }, { ...bought, readings_until: "2026-10-20T00:00:00Z" }];
    expect((await loadPrimaryVehicle(owner))?.vin).toBe(SOLD);
  });
});

describe("archiveOwnerDrives", () => {
  test("archives the drives of the owner's newer car, not only the first car", async () => {
    expect(await archiveOwnerDrives(owner, NOW)).toBe(1);
    expect(fake.rows("drive_archive").map((r) => r.vin)).toEqual([BOUGHT]);
  });
});
