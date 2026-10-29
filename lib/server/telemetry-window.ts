import "server-only";
import { firstArrival, TYRE_SEEN_FIELDS } from "@/lib/car-now";
import { DEMO } from "@/lib/demo";
import { mergeReadings, type PackedReadings, unpackReadings } from "@/lib/drive-archive";
import { HARD_MS2 } from "@/lib/drive-verdict";
import { DRIVE_DAYS } from "@/lib/drives";
import { num, type Reading } from "@/lib/telemetry-derive";
import { demoReadings } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { MAX_PAGES, PAGE } from "./telemetry";

// Several fields' readings in one window [from, to), by field, oldest first: one query instead of one
// per field. Rows come ordered by field then time, which the (vin, field, created_at) index serves, and
// the fixed upper bound keeps the offsets still while pages load. The first page brings the row count,
// so the rest are fetched together. The page cap is the per-field one pooled (MAX_PAGES per field), so
// past it the fields last in name order lose rows first. Null when the query fails (telemetry is a bonus).
// A window reaching back past the drive readings' retention also gets the archived drives' slimmed readings
// (lib/drive-archive.ts), merged in, so an old trip reads as a recent one does, a little coarser.
export async function loadReadingsByField(owner: Owner, vin: string, fields: string[], from: string, to: string): Promise<Record<string, Reading[]> | null> {
  return loadReadingsInWindows(owner, vin, fields, [{ from: Date.parse(from), to: Date.parse(to) }]);
}

// A window of time [from, to), in ms.
export type TimeWindow = { from: number; to: number };

// The windows sent in one request's or=: each adds about 95 characters to the URL.
const WINDOWS_PER_QUERY = 10;
const chunked = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / WINDOWS_PER_QUERY) }, (_, k) => list.slice(k * WINDOWS_PER_QUERY, (k + 1) * WINDOWS_PER_QUERY));
const iso = (t: number) => new Date(t).toISOString();

// As loadReadingsByField, for several windows: only the rows inside one of them come back (an or= of their
// ranges, a few windows per request so no URL gets long), so far-apart windows don't pull everything between
// them. Windows wholly past the readings' retention go to the archive only.
export async function loadReadingsInWindows(owner: Owner, vin: string, fields: string[], windows: TimeWindow[]): Promise<Record<string, Reading[]> | null> {
  if (DEMO) {
    const each = windows.map((w) => Object.fromEntries(fields.map((field) => [field, demoReadings(field, iso(w.from), iso(w.to))])));
    return each.length === 1 ? each[0] : mergeReadings(fields, ...each);
  }
  const now = Date.now();
  const live = windows.filter((w) => w.to > now - DRIVE_DAYS * 86_400_000);
  const reads = await Promise.all(chunked(live).map((group) => loadLiveReadings(owner, vin, fields, group)));
  if (reads.some((r) => r === null)) return null;
  const byField = reads.length === 1 ? reads[0]! : mergeReadings(fields, ...(reads as Record<string, Reading[]>[]));
  const old = windows.filter((w) => w.from < now - ARCHIVED_AFTER_MS);
  if (old.length === 0) return byField;
  const archived = await loadArchivedReadings(owner, vin, fields, old);
  return archived ? mergeReadings(fields, byField, archived) : byField;
}

async function loadLiveReadings(owner: Owner, vin: string, fields: string[], windows: TimeWindow[]): Promise<Record<string, Reading[]> | null> {
  const from = iso(Math.min(...windows.map((w) => w.from)));
  const to = iso(Math.max(...windows.map((w) => w.to)));
  const within = windows.map((w) => `and(created_at.gte.${iso(w.from)},created_at.lt.${iso(w.to)})`).join(",");
  const page = (k: number, count?: "exact") => {
    const q = ownerDb(owner).readings("field, created_at, value", { count }).eq("vin", vin).in("field", fields).gte("created_at", from).lt("created_at", to);
    return (windows.length > 1 ? q.or(within) : q)
      .order("field", { ascending: true })
      .order("created_at", { ascending: true })
      .range(k * PAGE, (k + 1) * PAGE - 1);
  };
  const first = await page(0, "exact");
  const total = first.count ?? first.data?.length ?? 0;
  const pages = Math.min(Math.ceil(total / PAGE), MAX_PAGES * fields.length);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, k) => page(k + 1)));
  const byField: Record<string, Reading[]> = Object.fromEntries(fields.map((field) => [field, []]));
  for (const { data, error } of [first, ...rest]) {
    if (error) {
      console.warn("Telemetry window unavailable:", error.message);
      return null;
    }
    for (const r of data ?? []) byField[r.field as string]?.push({ at: r.created_at as string, value: r.value as unknown });
  }
  return byField;
}

// Readings older than this may be gone (DRIVE_DAYS, less a day or two for the daily run's timing), so a
// window reaching back past it reads the archive too.
const ARCHIVED_AFTER_MS = (DRIVE_DAYS - 2) * 86_400_000;

// The archived drives' readings of these fields within the windows, by field: those of every drive whose
// kept span overlaps one, each unpacked only for the windows it overlaps. Null when the archive can't be read
// (or isn't there yet).
async function loadArchivedReadings(owner: Owner, vin: string, fields: string[], windows: TimeWindow[]): Promise<Record<string, Reading[]> | null> {
  const reads = await Promise.all(
    chunked(windows).map((group) => {
      const q = ownerDb(owner).archivedDrives("readings, readings_from, readings_to").eq("vin", vin);
      return group.length > 1
        ? q.or(group.map((w) => `and(readings_from.lt.${iso(w.to)},readings_to.gt.${iso(w.from)})`).join(","))
        : q.lt("readings_from", iso(group[0].to)).gt("readings_to", iso(group[0].from));
    }),
  );
  const failed = reads.find((r) => r.error);
  if (failed?.error) {
    console.warn("Archived readings unavailable:", failed.error.message);
    return null;
  }
  // A drive matched by two requests is unpacked twice; mergeReadings keeps one of each reading.
  const rows = reads.flatMap((r) => r.data ?? []);
  return mergeReadings(
    fields,
    ...rows.flatMap((row) => {
      const [kept, until] = [Date.parse(row.readings_from as string), Date.parse(row.readings_to as string)];
      return windows.filter((w) => w.from < until && w.to > kept).map((w) => unpackReadings(row.readings as PackedReadings, fields, w.from, w.to));
    }),
  );
}

const ACCEL = "LongitudinalAcceleration";
// A cap well past any month of hard moments (a few a drive); a read that hits it can't be trusted.
const HARD_CAP = PAGE * MAX_PAGES;

// The hard moments' raw material for the usual-drive comparison (see usualHardMoments): the acceleration
// readings at or past HARD_MS2 either way in [from, to), and when acceleration first streamed. The car
// sends one reading a second while driving, so a month of them is far too many rows; the filter keeps
// only the hard ones (jsonb numbers compare as numbers). Null when the read fails or hits the cap.
export async function loadHardAccel(owner: Owner, vin: string, from: string, to: string): Promise<{ hard: Reading[]; since: string | null } | null> {
  if (DEMO) {
    const all = demoReadings(ACCEL, "1970-01-01T00:00:00.000Z");
    return { hard: demoReadings(ACCEL, from, to).filter((r) => Math.abs(num(r.value) ?? 0) >= HARD_MS2), since: all[0]?.at ?? null };
  }
  const [hard, first] = await Promise.all([
    ownerDb(owner)
      .readings("created_at, value")
      .eq("vin", vin)
      .eq("field", ACCEL)
      .gte("created_at", from)
      .lt("created_at", to)
      .or(`value.gte.${HARD_MS2},value.lte.${-HARD_MS2}`)
      .order("created_at", { ascending: true })
      .limit(HARD_CAP),
    ownerDb(owner).readings("created_at").eq("vin", vin).eq("field", ACCEL).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (hard.error || first.error) {
    console.warn("Hard acceleration readings unavailable:", (hard.error ?? first.error)?.message);
    return null;
  }
  const rows = hard.data ?? [];
  if (rows.length >= HARD_CAP) return null;
  return { hard: rows.map((r) => ({ at: r.created_at as string, value: r.value as unknown })), since: (first.data?.created_at as string | undefined) ?? null };
}

// When the car first sent a field Uplink can still see, or null when it never has (or the read fails): a
// car that doesn't send acceleration has unknown hard moments, not none.
export async function firstReadingAt(owner: Owner, vin: string, field: string): Promise<number | null> {
  if (DEMO) {
    const first = demoReadings(field, "1970-01-01T00:00:00.000Z")[0];
    return first ? Date.parse(first.at) : null;
  }
  const { data, error } = await ownerDb(owner).readings("created_at").eq("vin", vin).eq("field", field).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    console.warn(`First ${field} reading unavailable:`, error.message);
    return null;
  }
  return data ? Date.parse(data.created_at as string) : null;
}

// The Owners page's acceleration for one day (lib/owners-day.ts): the readings at or past `slowing` of
// deceleration, for one-pedal driving, and those at or past HARD_MS2 of speeding up, for hard starts. A day's
// driving is thousands of readings; the filter keeps a fraction. Null when the read fails or hits the cap.
export async function loadSlowingAccel(owner: Owner, vin: string, slowing: number, from: string, to: string): Promise<Reading[] | null> {
  const wanted = (v: number | null) => v !== null && (v <= -slowing || v >= HARD_MS2);
  if (DEMO) return demoReadings(ACCEL, from, to).filter((r) => wanted(num(r.value)));
  const rows: Reading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await ownerDb(owner)
      .readings("created_at, value")
      .eq("vin", vin)
      .eq("field", ACCEL)
      .gte("created_at", from)
      .lt("created_at", to)
      .or(`value.lte.${-slowing},value.gte.${HARD_MS2}`)
      .order("created_at", { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) {
      console.warn("Acceleration readings unavailable:", error.message);
      return null;
    }
    rows.push(...(data ?? []).map((r) => ({ at: r.created_at as string, value: r.value as unknown })));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
  return null;
}

export const TYRE_ARRIVAL_DAYS = 14;

// When each tyre's current TpmsLastSeenPressureTime* value first arrived (see firstArrival), from the last
// TYRE_ARRIVAL_DAYS of readings: carNow needs it to tell a real measured time from a wrong one. Null for a
// tyre whose value goes back further, or when the read fails.
export async function loadTyreArrivals(owner: Owner, vin: string, now: number): Promise<Record<string, string | null>> {
  const readings = await loadReadingsByField(owner, vin, TYRE_SEEN_FIELDS, new Date(now - TYRE_ARRIVAL_DAYS * 86_400_000).toISOString(), new Date(now + 1).toISOString());
  return Object.fromEntries(TYRE_SEEN_FIELDS.map((field) => [field, readings ? firstArrival(readings[field] ?? []) : null]));
}
