import "server-only";
import { buildSessions, CHARGE_FIELDS, type ChargeReading } from "@/lib/charge-sessions";
import { DEMO } from "@/lib/demo";
import { demoStreamSessions } from "./demo";
import { type Owner, ownerDb } from "./data/owner";
import { readingsBefore } from "./telemetry";

const DAY = 24 * 60 * 60 * 1000;
const FIRST_SYNC_DAYS = 60;
const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 50;
// Enough for the "All time" view; the stats page works out each period from this list.
const LIST_LIMIT = 1000;
// Long enough for the station check (every 15 minutes) or a page view to run a sync after the readings
// that follow a session's end (SETTLE_MS) have arrived, short enough that an old session isn't reread.
const RECOVER_MS = 2 * 60 * 60 * 1000;

// Fields whose last value before the watermark still describes the car at the watermark.
// The charge state is left out on purpose: replaying an old "Charging" would start a session late.
const BASELINE_FIELDS = ["BatteryLevel", "EnergyRemaining", "FastChargerPresent", "FastChargerType", "ChargingCableType", "ModuleTempMax"];

export type StreamChargeSession = {
  id: number;
  vin: string;
  started_at: string;
  ended_at: string | null;
  kind: "ac" | "dc";
  supercharger: boolean;
  energy_added_kwh: number | null;
  start_level: number | null;
  end_level: number | null;
  start_energy_kwh: number | null;
  end_energy_kwh: number | null;
  peak_power_kw: number | null;
  ac_voltage: number | null;
  ac_amps: number | null;
  ac_phases: number | null;
  cable_type: string | null;
  temp_max_c: number | null;
  temp_start_c: number | null;
  station_name: string | null; // from OpenStreetMap; null when unknown (see station-check.ts)
};

// Numeric columns come back from PostgREST as numbers or strings.
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

async function watermark(owner: Owner, vin: string): Promise<{ at: string; openStartedAt: string | null }> {
  const open = await ownerDb(owner)
    .from("stream_charge_sessions")
    .select("started_at")
    .eq("vin", vin)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open.error) throw new Error(open.error.message);
  if (open.data) return { at: open.data.started_at as string, openStartedAt: open.data.started_at as string };
  const ended = await ownerDb(owner)
    .from("stream_charge_sessions")
    .select("started_at, ended_at")
    .eq("vin", vin)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ended.error) throw new Error(ended.error.message);
  if (ended.data?.ended_at) {
    // A session that ended lately is rebuilt from its start, so the readings sent after its end (the
    // counter's last count, the settled level; see buildSessions) still reach it. Same start, same row.
    const recent = Date.now() - Date.parse(ended.data.ended_at as string) < RECOVER_MS;
    return { at: (recent ? ended.data.started_at : ended.data.ended_at) as string, openStartedAt: null };
  }
  return { at: new Date(Date.now() - FIRST_SYNC_DAYS * DAY).toISOString(), openStartedAt: null };
}

async function readingsSince(owner: Owner, vin: string, since: string): Promise<ChargeReading[]> {
  const out: ChargeReading[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await ownerDb(owner)
      .readings("field, created_at, value")
      .eq("vin", vin)
      .in("field", CHARGE_FIELDS)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) out.push({ field: row.field as string, at: row.created_at as string, value: row.value as unknown });
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

// The latest value of each baseline field before `before`, so a session that is resumed mid-way
// keeps its start battery level. One request for all of them (see readingsBefore).
async function baselineBefore(owner: Owner, vin: string, before: string): Promise<ChargeReading[]> {
  const latest = await readingsBefore(owner, vin, BASELINE_FIELDS, before);
  return BASELINE_FIELDS.flatMap((field) => (latest[field] ? [{ field, at: latest[field].at, value: latest[field].value }] : []));
}

// Rebuilds the car's charging sessions from streamed readings and upserts them. Safe to run any
// number of times: it starts from the last open (or last finished) session and rewrites from there.
export async function syncStreamSessions(owner: Owner, vin: string): Promise<void> {
  if (DEMO) return;
  const mark = await watermark(owner, vin);
  const [baseline, readings] = await Promise.all([baselineBefore(owner, vin, mark.at), readingsSince(owner, vin, mark.at)]);
  const sessions = buildSessions([...baseline, ...readings]);
  const now = new Date().toISOString();
  if (sessions.length > 0) {
    const { error } = await ownerDb(owner)
      .from("stream_charge_sessions")
      .upsert(
        sessions.map((s) => ({ ...s, vin, updated_at: now })),
        { onConflict: "user_id,vin,started_at" },
      );
    if (error) throw new Error(error.message);
  }
  // An open session the rebuild no longer produces (it turned out to be a blip) would hold the
  // watermark back forever, so it goes.
  if (mark.openStartedAt && !sessions.some((s) => Date.parse(s.started_at) === Date.parse(mark.openStartedAt!))) {
    const { error } = await ownerDb(owner).from("stream_charge_sessions").delete().eq("vin", vin).eq("started_at", mark.openStartedAt).is("ended_at", null);
    if (error) throw new Error(error.message);
  }
}

// Best effort for callers that must never fail on it (the poll, the stats page).
export async function syncStreamSessionsSafely(owner: Owner, vins: (string | null | undefined)[]): Promise<void> {
  for (const vin of new Set(vins.filter((v): v is string => Boolean(v)))) {
    try {
      await syncStreamSessions(owner, vin);
    } catch (err) {
      console.warn(`Streamed charging sessions unavailable for ${vin}:`, (err as Error).message);
    }
  }
}

// Every one of the owner's cars.
export async function syncStreamSessionsForAllCars(owner: Owner): Promise<void> {
  if (DEMO) return;
  const { data, error } = await ownerDb(owner).from("vehicles").select("vin");
  if (error) {
    console.warn("Streamed charging sessions unavailable:", error.message);
    return;
  }
  await syncStreamSessionsSafely(owner, (data ?? []).map((v) => v.vin as string | null));
}

// The columns the loaders read, and how a row becomes a session.
export const SESSION_COLUMNS =
  "id, vin, started_at, ended_at, kind, supercharger, energy_added_kwh, start_level, end_level, start_energy_kwh, end_energy_kwh, peak_power_kw, ac_voltage, ac_amps, ac_phases, cable_type, temp_max_c, temp_start_c";

// Undefined column (Postgres) or one missing from PostgREST's schema cache.
const MISSING_COLUMN = ["42703", "PGRST204"];

// Runs a select with the station column, and again without it on a database that hasn't had its
// migration yet, so the sessions still show (unlabelled) instead of vanishing.
export async function selectSessions<T extends { error: { code: string } | null }>(run: (columns: string) => PromiseLike<T>): Promise<T> {
  const result = await run(`${SESSION_COLUMNS}, station_name`);
  return result.error && MISSING_COLUMN.includes(result.error.code) ? run(SESSION_COLUMNS) : result;
}

export function toStreamSession(row: Record<string, unknown>): StreamChargeSession {
  return {
    id: row.id as number,
    vin: row.vin as string,
    started_at: row.started_at as string,
    ended_at: (row.ended_at as string | null) ?? null,
    kind: row.kind === "dc" ? "dc" : "ac",
    supercharger: Boolean(row.supercharger),
    energy_added_kwh: num(row.energy_added_kwh),
    start_level: num(row.start_level),
    end_level: num(row.end_level),
    start_energy_kwh: num(row.start_energy_kwh),
    end_energy_kwh: num(row.end_energy_kwh),
    peak_power_kw: num(row.peak_power_kw),
    ac_voltage: num(row.ac_voltage),
    ac_amps: num(row.ac_amps),
    ac_phases: num(row.ac_phases),
    cable_type: (row.cable_type as string | null) ?? null,
    temp_max_c: num(row.temp_max_c),
    temp_start_c: num(row.temp_start_c),
    station_name: typeof row.station_name === "string" && row.station_name ? row.station_name : null,
  };
}

// The owner's sessions, newest first. A missing table or a read error shows as an empty list, with a log line.
export async function loadStreamSessions(owner: Owner, limit = LIST_LIMIT): Promise<StreamChargeSession[]> {
  if (DEMO) return demoStreamSessions().slice(0, limit);
  const { data, error } = await selectSessions((columns) =>
    ownerDb(owner).from("stream_charge_sessions").select(columns).order("started_at", { ascending: false }).limit(limit),
  );
  if (error) {
    console.warn("Streamed charging sessions unavailable:", error.message);
    return [];
  }
  // A select built from a string has no row type.
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toStreamSession);
}
