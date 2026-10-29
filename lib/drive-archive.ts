import { buildDrives, type Drive, DRIVE_DAYS } from "@/lib/drives";
import { num, type Reading } from "@/lib/telemetry-derive";

// Drives kept past the readings' retention (supabase/migrations/20261112120000_drive_archive.sql). Each
// finished drive is stored with a slimmed copy of the readings its trip page and trip list read, so an old
// trip keeps its numbers, charts, route and places once the full readings are deleted. No database here,
// so it's tested directly: lib/server/drive-archive.ts passes in the reads and writes.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// A drive is archived once it has been over this long: its last readings are in.
const SETTLED_MS = HOUR;
// What buildDrives reads (see loadWindowStats).
const DRIVE_FIELDS = ["Gear", "Odometer", "BatteryLevel", "EnergyRemaining", "LifetimeEnergyUsed", "RatedRange", "DetailedChargeState"];

// One archived drive as stored (drive_archive): the Drive, and its slimmed readings over readings_from .. readings_to.
export type ArchivedDriveRow = { vin: string; start_at: string; end_at: string; readings_from: string; readings_to: string; drive: Drive; readings: PackedReadings };

// What an old trip reads: the trip page (lib/server/drive-detail.ts: battery, speed, outside temperature,
// route, acceleration, power, grade, climate) and the trip list's places (lib/server/trip-places.ts).
export const ARCHIVE_FIELDS = [
  "BatteryLevel",
  "VehicleSpeed",
  "OutsideTemp",
  "Location",
  "LongitudinalAcceleration",
  "PackVoltage",
  "PackCurrent",
  "GradeEstimatePercent",
  "HvacPower",
  "HvacACEnabled",
  "HvacLeftTemperatureRequest",
  "HvacRightTemperatureRequest",
  "InsideTemp",
];

// The slot readings are thinned to: one or two a slot instead of one a second or so while driving.
export const SLOT_MS = 30_000;

// The span kept around a drive, as the trip page reads it: from half an hour before (the values in force
// at the start, where it set off) to ten minutes after (where it ended up).
export function archiveSpan(drive: Pick<Drive, "start" | "end">): { from: number; to: number } {
  return { from: drive.start - 30 * MIN, to: drive.end + 10 * MIN };
}

// One field's readings thinned to SLOT_MS slots, oldest first, every one a reading the car sent (never an
// average, so peaks and the moment they happened stay true):
//   numbers: the lowest and the highest of each slot, so a hard stop or a power spike survives;
//   a location (an object): the first of each slot, a point every 30 s along the route;
//   anything else (true/false, a word): the first of each slot and every change.
export function slimReadings(readings: Reading[], slotMs = SLOT_MS): Reading[] {
  const sorted = [...readings].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const slot = (r: Reading) => Math.floor(Date.parse(r.at) / slotMs);
  const out: Reading[] = [];
  let k = 0;
  while (k < sorted.length) {
    const s = slot(sorted[k]);
    let end = k;
    while (end < sorted.length && slot(sorted[end]) === s) end++;
    const group = sorted.slice(k, end);
    const numbers = group.filter((r) => num(r.value) !== null);
    if (numbers.length === group.length) {
      const low = numbers.reduce((a, b) => (num(b.value)! < num(a.value)! ? b : a));
      const high = numbers.reduce((a, b) => (num(b.value)! > num(a.value)! ? b : a));
      out.push(...(low === high ? [low] : [low, high].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))));
    } else if (group.some((r) => typeof r.value === "object" && r.value !== null)) {
      out.push(group[0]);
    } else {
      group.forEach((r, i) => {
        if (i === 0 || JSON.stringify(r.value) !== JSON.stringify(group[i - 1].value)) out.push(r);
      });
    }
    k = end;
  }
  return out;
}

// Stored form: { field: [[created_at, value], ...] }.
export type PackedReadings = Record<string, [string, unknown][]>;

export function packReadings(byField: Record<string, Reading[]>): PackedReadings {
  return Object.fromEntries(Object.entries(byField).filter(([, list]) => list.length > 0).map(([field, list]) => [field, slimReadings(list).map((r) => [r.at, r.value])]));
}

// The stored readings of the given fields within [from, to), by field.
export function unpackReadings(packed: PackedReadings, fields: string[], from: number, to: number): Record<string, Reading[]> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      (packed[field] ?? []).flatMap(([at, value]) => {
        const t = Date.parse(at);
        return t >= from && t < to ? [{ at, value }] : [];
      }),
    ]),
  );
}

// Readings from several sources (the full readings and the archive) as one list per field, oldest first.
// A reading is the same reading wherever it came from, so one at the same instant is kept once.
export function mergeReadings(fields: string[], ...sources: Record<string, Reading[]>[]): Record<string, Reading[]> {
  return Object.fromEntries(
    fields.map((field) => {
      const byAt = new Map<string, Reading>();
      for (const source of sources) for (const r of source[field] ?? []) if (!byAt.has(r.at)) byAt.set(r.at, r);
      return [field, [...byAt.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))];
    }),
  );
}

// Drives from the window (rebuilt from the full readings) with the archived ones from before it. An
// archived drive is used only where the window has none: before `windowFrom`, and not overlapping a drive
// the window rebuilt (one under way when the window opens is rebuilt from part of its readings). Newest first.
export function withArchivedDrives(windowDrives: Drive[], archived: Drive[], windowFrom: number): Drive[] {
  const older = archived.filter((a) => a.start < windowFrom);
  const live = windowDrives.filter((d) => !older.some((a) => d.start <= a.end && d.end >= a.start));
  return [...live, ...older].sort((a, b) => b.start - a.start);
}

export type ArchiveSources = {
  read: (fields: string[], from: number, to: number) => Promise<Record<string, Reading[]> | null>;
  last: () => Promise<{ start: number; end: number } | null>;
  save: (rows: ArchivedDriveRow[]) => Promise<void>;
};

// One car's finished drives not yet archived: those after the newest one archived, or on the first run
// every drive in the readings still kept. Drives are rebuilt from the readings since then, as the Driving
// page rebuilds them; one under way when that span opens is a fragment, so it's left out (it is either
// archived already, or started before the readings kept). Returns how many were added. The sources are
// passed in, so it can be tested without a database.
export async function archiveCarDrives(src: ArchiveSources, vin: string, now: number): Promise<number> {
  const last = await src.last();
  const oldest = now - (DRIVE_DAYS - 1) * DAY;
  const from = Math.max(oldest, last ? last.end - 6 * HOUR : oldest);
  const r = await src.read(DRIVE_FIELDS, from, now);
  if (!r) return 0;
  const drives = buildDrives({
    gear: r.Gear,
    odometer: r.Odometer,
    battery: r.BatteryLevel,
    energy: r.EnergyRemaining,
    lifetime: r.LifetimeEnergyUsed,
    range: r.RatedRange,
    charge: r.DetailedChargeState,
  })
    .filter((d) => d.end <= now - SETTLED_MS && (last ? d.start > last.end : d.start >= from + HOUR))
    // Oldest first, so a run cut short leaves no gap: the next starts after the newest stored.
    .sort((a, b) => a.start - b.start);
  const rows: ArchivedDriveRow[] = [];
  for (const drive of drives) {
    const span = archiveSpan(drive);
    const readings = await src.read(ARCHIVE_FIELDS, span.from, span.to);
    // A drive whose readings can't be read now is tried again tomorrow, not stored without them.
    if (!readings) break;
    rows.push({
      vin,
      start_at: new Date(drive.start).toISOString(),
      end_at: new Date(drive.end).toISOString(),
      readings_from: new Date(span.from).toISOString(),
      readings_to: new Date(span.to).toISOString(),
      drive,
      readings: packReadings(readings),
    });
  }
  await src.save(rows);
  return rows.length;
}
