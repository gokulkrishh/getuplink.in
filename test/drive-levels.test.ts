import { describe, expect, test } from "bun:test";
import { buildDrives, type DriveInputs, parkedDrain, parkedNow } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";
import { groupTrips } from "@/lib/trips";

// 25 Oct 2026, as the car streamed it (UTC): leg 1 from 9:08 PM IST, a DC charge from 9:25 PM to 9:55 PM,
// then leg 2 from 9:56 PM to 10:04 PM. Levels and energy arrive only every 5 minutes, so the last battery
// reading before leg 2 (67.79 at 9:52 PM) was taken mid-charge.
const at = (hms: string) => new Date(`2026-10-25T${hms}Z`).toISOString();
const r = (hms: string, value: unknown): Reading => ({ at: at(hms), value });

const real: DriveInputs = {
  gear: [
    r("15:36:32", "ShiftStateP"), r("15:37:59", "ShiftStateP"), r("15:38:39", "ShiftStateR"), r("15:39:02", "ShiftStateD"),
    r("15:49:12", "ShiftStateR"), r("15:49:30", "ShiftStateP"), r("16:26:42", "ShiftStateD"), r("16:34:21", "ShiftStateP"),
  ],
  odometer: [
    r("15:36:32", 2100.7411470637076), r("15:40:36", 2100.8411878304096), r("15:47:18", 2103.010394765542),
    r("16:27:15", 2103.115406502018), r("16:30:15", 2104.034414538987), r("16:33:45", 2105.279642467376),
  ],
  battery: [
    r("15:36:32", 47.232351647086865), r("15:37:59", 47.16751657276005), r("15:42:59", 46.940593812616186),
    r("15:47:59", 46.38949568083824), r("15:52:59", 46.29224306934801), r("15:57:59", 48.17246022482573),
    r("16:02:59", 52.0301471472714), r("16:22:59", 67.78507020868815), r("16:27:59", 70.18396795878043),
    r("16:32:59", 69.56803475267564), r("16:37:59", 69.3735295296952), r("16:42:59", 69.30869445536838),
    r("16:52:59", 69.21144184387815),
  ],
  energy: [
    r("15:36:32", 30.879999309778214), r("15:42:59", 30.759999312460423), r("15:47:59", 30.379999320954084),
    r("15:55:52", 30.499999318271875), r("16:20:52", 41.999999061226845), r("16:25:52", 44.3799990080297),
    r("16:30:52", 44.11999901384115), r("16:35:52", 43.87999901920557), r("16:54:56", 43.75999902188778),
  ],
  // LifetimeEnergyUsed rose 0.78 kWh over leg 2, against 0.50 for EnergyRemaining and 0.81% of a 62 kWh pack.
  lifetime: [
    r("15:37:59", 917.127043561195), r("15:47:59", 917.925043599098), r("15:52:59", 917.9750436014729),
    r("16:25:57", 917.9900436021853), r("16:30:57", 918.4670436248416), r("16:35:57", 918.7700436392333),
    r("16:40:57", 918.7970436405158),
  ],
  range: [
    r("15:37:59", 127.17724004576972), r("15:47:59", 124.98905628723962), r("15:52:59", 124.726474236216),
    r("16:22:59", 182.40699811106958), r("16:27:59", 188.3588579342715), r("16:32:59", 187.22100237983582),
    r("16:37:59", 186.78336562812981),
  ],
  charge: [
    r("15:36:32", "DetailedChargeStateDisconnected"), r("15:49:59", "DetailedChargeStateNoPower"), r("15:52:53", "DetailedChargeStateDisconnected"),
    r("15:53:53", "DetailedChargeStateNoPower"), r("15:54:56", "DetailedChargeStateStopped"), r("15:55:56", "DetailedChargeStateCharging"),
    r("16:25:54", "DetailedChargeStateComplete"), r("16:26:54", "DetailedChargeStateDisconnected"),
  ],
};

describe("drive levels on 25 Oct 2026", () => {
  const [leg2, leg1] = buildDrives(real);

  test("the drive after the charge reads 70% to 69% and 0.5 kWh, not 68% to 70% and 0.8 kWh", () => {
    expect(leg2.start).toBe(1792945602000);
    expect(Math.round(leg2.startLevel!)).toBe(70);
    expect(Math.round(leg2.endLevel!)).toBe(69);
    expect(leg2.kwh!).toBeCloseTo(0.5, 2); // 44.38 to 43.88
    expect(leg2.rangeKm!).toBeCloseTo((188.3588579342715 - 186.78336562812981) * 1.609344, 2);
  });

  test("the drive before the charge reads 47% to 46% and 0.5 kWh, ending before the charge began", () => {
    expect(Math.round(leg1.startLevel!)).toBe(47);
    expect(Math.round(leg1.endLevel!)).toBe(46);
    expect(leg1.kwh!).toBeCloseTo(0.5, 2); // 30.88 to 30.38: 30.50 at 9:25 PM is already the charger's
  });

  test("a charge between two drives splits the trip", () => {
    expect(leg2.chargedBefore).toBe(true);
    expect(leg1.chargedBefore).toBeUndefined();
    const trips = groupTrips([leg1, leg2]);
    expect(trips).toHaveLength(2);
    expect(trips.map((t) => t.stops)).toEqual([0, 0]);
  });

  test("parked now counts from the first reading after park, not the last one while driving", () => {
    const now = parkedNow(real)!;
    expect(now.lostPercent!).toBeCloseTo(69.3735295296952 - 69.21144184387815, 4);
  });
});

// General cases on a made-up timeline (minutes from 10:00 UTC).
const t0 = Date.parse("2026-10-20T10:00:00Z");
const m = (min: number, value: unknown): Reading => ({ at: new Date(t0 + min * 60_000).toISOString(), value });
const base = (over: Partial<DriveInputs>): DriveInputs => ({
  gear: [m(0, "ShiftStateP"), m(60, "ShiftStateD"), m(80, "ShiftStateP")],
  odometer: [m(0, 100), m(70, 105), m(80, 110)],
  battery: [],
  energy: [],
  lifetime: [],
  range: [],
  charge: [],
  ...over,
});

describe("drive levels in general", () => {
  test("a reading sent with the first D is mid-drive: the start is the reading before, as for the odometer", () => {
    // 23 Oct 2026: readings every 5 minutes, the car already moving when D was first sent. Reading the
    // start from the D batch gave 0.14 kWh over 3.5 km (40 Wh/km); from the batch before, 0.38 kWh.
    const [d] = buildDrives(base({
      gear: [m(0, "ShiftStateP"), m(5, "ShiftStateD"), m(10, "ShiftStateP")],
      odometer: [m(0, 100), m(5, 101), m(10, 102.17)],
      energy: [m(0, 38.5), m(5, 38.26), m(10, 38.12)],
      battery: [m(0, 60.39), m(5, 59.81), m(10, 59.65)],
    }));
    expect(d.kwh).toBeCloseTo(0.38, 5);
    expect([d.startLevel, d.endLevel]).toEqual([60.39, 59.65]);
  });

  test("a drive right after a charge starts from the first reading inside it", () => {
    const [d] = buildDrives(base({
      battery: [m(5, 50), m(55, 78), m(65, 80), m(75, 78), m(82, 77.8)],
      charge: [m(10, "DetailedChargeStateCharging"), m(58, "DetailedChargeStateComplete")],
    }));
    expect([d.startLevel, d.endLevel]).toEqual([80, 77.8]);
  });

  test("a level that rose before the drive (a charge never reported) starts from inside the drive", () => {
    const [d] = buildDrives(base({ battery: [m(5, 50), m(65, 70), m(82, 69)] }));
    expect([d.startLevel, d.endLevel]).toEqual([70, 69]);
  });

  test("a reading taken just before the charge ended counts as its end", () => {
    const [d] = buildDrives(base({
      energy: [m(57.5, 44), m(70, 43.5), m(81, 43)],
      charge: [m(10, "DetailedChargeStateCharging"), m(58, "DetailedChargeStateComplete")],
    }));
    expect(d.kwh).toBeCloseTo(1, 5);
  });

  test("with no reading inside the drive after a charge, nothing is shown", () => {
    const [d] = buildDrives(base({
      battery: [m(55, 78), m(82, 77)],
      energy: [m(55, 44), m(82, 43)],
      charge: [m(10, "DetailedChargeStateCharging"), m(58, "DetailedChargeStateComplete")],
    }));
    expect([d.startLevel, d.endLevel, d.kwh]).toEqual([null, null, null]);
  });

  test("with no reading inside the drive but one before and one soon after park, both are used", () => {
    const [d] = buildDrives(base({ battery: [m(30, 60), m(83, 59)] }));
    expect([d.startLevel, d.endLevel]).toEqual([60, 59]);
  });

  test("with no reading inside the drive and none soon after park, nothing is shown", () => {
    const [d] = buildDrives(base({ battery: [m(30, 60), m(120, 59)] }));
    expect([d.startLevel, d.endLevel]).toEqual([null, null]);
  });

  test("the end never reads into a charge that starts after park", () => {
    const [d] = buildDrives(base({
      battery: [m(30, 60), m(75, 58), m(83, 62)],
      charge: [m(82, "DetailedChargeStateCharging"), m(120, "DetailedChargeStateComplete")],
    }));
    expect([d.startLevel, d.endLevel]).toEqual([60, 58]);
  });

  test("energy comes from EnergyRemaining, not the lifetime counter", () => {
    const [d] = buildDrives(base({ energy: [m(30, 40), m(83, 38)], lifetime: [m(30, 900), m(83, 903.4)] }));
    expect(d.kwh).toBeCloseTo(2, 5);
  });
});

describe("parked drain after a charge", () => {
  test("starts from the first reading after the charge, not one taken mid-charge", () => {
    const h = 60;
    const input = base({
      gear: [m(0, "ShiftStateP"), m(60, "ShiftStateD"), m(80, "ShiftStateP"), m(20 * h, "ShiftStateD"), m(20 * h + 20, "ShiftStateP")],
      odometer: [m(0, 100), m(80, 110), m(20 * h + 20, 120)],
      battery: [m(85, 50), m(100, 55), m(3 * h + 2, 80), m(19 * h, 79)],
      charge: [m(90, "DetailedChargeStateCharging"), m(3 * h, "DetailedChargeStateComplete")],
    });
    const periods = parkedDrain(input, t0 + 21 * h * 60_000);
    expect(periods).toHaveLength(1);
    // Before: the 55 read mid-charge made the level look like it rose, so the stretch was dropped.
    expect(periods[0].lostPercent).toBeCloseTo(1, 5);
  });
});
