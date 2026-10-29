import { beforeEach, describe, expect, test } from "bun:test";
import { type ArchivedDriveRow, archiveCarDrives, type ArchiveSources } from "@/lib/drive-archive";
import type { Reading } from "@/lib/telemetry-derive";

// archiveCarDrives with its sources passed in (no database): which drives it stores, and what with them.

const H = 3_600_000;
const NOW = Date.parse("2026-10-29T12:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

// Two drives yesterday (gear D to P) with the car's readings, one a second while moving.
const drives = [
  { start: NOW - 30 * H, end: NOW - 29 * H, miles: [1000, 1020] },
  { start: NOW - 6 * H, end: NOW - 5.5 * H, miles: [1020, 1030] },
];
// One that ended 20 minutes ago: not settled yet.
const recent = { start: NOW - 1 * H, end: NOW - 20 * 60_000, miles: [1030, 1032] };

function readings(field: string, from: number, to: number): Reading[] {
  const all: Reading[] = [];
  const add = (t: number, value: unknown) => t >= from && t < to && all.push({ at: iso(t), value });
  add(NOW - 40 * H, "ShiftStateP");
  for (const d of [...drives, recent]) {
    if (field === "Gear") {
      add(d.start, "ShiftStateD");
      add(d.end, "ShiftStateP");
    }
    if (field === "Odometer") {
      add(d.start - 60_000, d.miles[0]);
      add(d.end + 60_000, d.miles[1]);
    }
    if (field === "VehicleSpeed") for (let t = d.start; t < d.end; t += 1000) add(t, 30);
    if (field === "Location") for (let t = d.start; t < d.end; t += 1000) add(t, { latitude: 12.9, longitude: 77.6 });
  }
  return all;
}

let archivedLast: { start: number; end: number } | null = null;
let saved: ArchivedDriveRow[] = [];
const src: ArchiveSources = {
  read: async (fields, from, to) => Object.fromEntries(fields.map((f) => [f, readings(f, from, to)])),
  last: async () => archivedLast,
  save: async (rows) => void saved.push(...rows),
};
const run = () => archiveCarDrives(src, "VIN1", NOW);
const km = (row: ArchivedDriveRow) => Math.round(row.drive.km);
const kept = (row: ArchivedDriveRow, field: string) => row.readings[field].length;

beforeEach(() => {
  archivedLast = null;
  saved = [];
});

describe("archiveCarDrives", () => {
  test("stores each settled drive once, oldest first, with its slimmed readings", async () => {
    expect(await run()).toBe(2);
    expect(saved.map((r) => r.start_at)).toEqual([iso(drives[0].start), iso(drives[1].start)]);
    expect(saved.map(km)).toEqual([32, 16]);
    // An hour of speed at one a second keeps at most two readings a 30 s slot (plus the edge slots).
    expect(kept(saved[0], "VehicleSpeed")).toBeLessThanOrEqual(122);
    expect(kept(saved[0], "Location")).toBeLessThanOrEqual(121);
  });

  test("leaves the drives already archived and one that ended less than an hour ago", async () => {
    archivedLast = { start: drives[0].start, end: drives[0].end };
    expect(await run()).toBe(1);
    expect(saved.map((r) => r.start_at)).toEqual([iso(drives[1].start)]);
  });
});
