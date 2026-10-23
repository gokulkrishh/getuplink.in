import { describe, expect, test } from "bun:test";
import { buildDrives, type DriveInputs } from "@/lib/drives";
import type { Reading } from "@/lib/telemetry-derive";

// 23 Oct 2026, as the car streamed it: gear and odometer every 5 minutes, so the car was already moving
// when Drive was first read, and moving again before the next Drive.
const ist = (hms: string) => new Date(Date.parse(`2026-10-23T${hms}+05:30`)).toISOString();
const r = (hms: string, value: unknown): Reading => ({ at: ist(hms), value });
const gear = [
  r("10:49:10", "ShiftStateP"), r("10:54:10", "ShiftStateD"), r("10:59:10", "ShiftStateP"), r("11:04:10", "ShiftStateP"),
  r("11:14:15", "ShiftStateP"), r("11:19:15", "ShiftStateD"), r("11:24:15", "ShiftStateP"), r("11:29:15", "ShiftStateD"),
  r("12:04:07", "ShiftStateR"), r("12:09:07", "ShiftStateP"), r("13:08:50", "ShiftStateP"),
];
const odometer = [
  r("10:49:10", 2072.0244760504906), r("10:54:10", 2072.7384315842824), r("10:59:10", 2073.9904945961107),
  r("11:04:10", 2074.198653955397), r("11:14:15", 2074.280674956668), r("11:19:15", 2075.52341740017),
  r("11:24:15", 2077.7640820258034), r("11:29:15", 2079.628195691056), r("11:59:15", 2098.840372496372),
  r("12:04:15", 2100.6995151918504), r("13:08:50", 2100.7411470637076),
];
const input: DriveInputs = { gear, odometer, battery: [], energy: [], lifetime: [], range: [], charge: [] };

describe("buildDrives", () => {
  test("drives add up to the odometer, counting from before the first Drive reading", () => {
    const drives = buildDrives(input);
    const total = drives.reduce((sum, d) => sum + d.km, 0);
    // 2072.02 to 2100.70 miles is 46.2 km; only the 0.1 km moved during a 10-minute 'stop' is not a drive.
    expect(total).toBeGreaterThan(45.9);
    expect(total).toBeLessThan(46.3);
    expect(drives.at(-1)!.km).toBeGreaterThan(3); // the first drive keeps the 1.1 km before Drive was read
  });
});
