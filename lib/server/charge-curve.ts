import "server-only";
import { type ChargeCurve, chargeCurve } from "@/lib/charge-curve";
import { matchSessions } from "@/lib/charge-sessions";
import { DEMO } from "@/lib/demo";
import type { Reading } from "@/lib/telemetry-derive";
import { type ChargingSession, loadChargingSessions } from "./charging";
import { demoStreamSessions } from "./demo";
import { SESSION_COLUMNS, type StreamChargeSession, toStreamSession } from "./stream-charging";
import { db } from "./supabase";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60 * 1000;
// A level or temperature sent this long before the start still describes the battery at the start.
const LEAD_MS = 60 * MIN;

export type ChargeDetail = { session: StreamChargeSession; tesla: ChargingSession | null; curve: ChargeCurve };

async function loadStreamSession(id: number): Promise<StreamChargeSession | null> {
  if (DEMO) return demoStreamSessions().find((s) => s.id === id) ?? null;
  const { data, error } = await db().from("stream_charge_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.warn("Streamed charging session unavailable:", error.message);
    return null;
  }
  return data ? toStreamSession(data) : null;
}

// Readings from the start on. The car only sends a value when it changes, so a field that carries over
// is led by its last reading before the start, moved to the start.
function fromStart(readings: Reading[], start: string, carry: boolean): Reading[] {
  const t0 = Date.parse(start);
  const during = readings.filter((r) => Date.parse(r.at) >= t0);
  const lead = carry ? readings.findLast((r) => Date.parse(r.at) < t0) : undefined;
  return lead ? [{ at: start, value: lead.value }, ...during] : during;
}

// One streamed session with its readings, and the Supercharger session it matches, if any.
export async function loadChargeDetail(id: number, now: number): Promise<ChargeDetail | null> {
  const session = await loadStreamSession(id);
  if (!session) return null;
  const end = session.ended_at ? Date.parse(session.ended_at) : now;
  const from = new Date(Date.parse(session.started_at) - LEAD_MS).toISOString();
  // The 0 kW reading that closes a session can land just after its end.
  const to = new Date(end + MIN).toISOString();
  const powerField = session.kind === "dc" ? "DCChargingPower" : "ACChargingPower";
  const [byField, tesla] = await Promise.all([
    loadReadingsByField(session.vin, [powerField, "BatteryLevel", "ModuleTempMin", "ModuleTempMax"], from, to),
    loadChargingSessions(),
  ]);
  const read = (field: string) => byField?.[field] ?? [];
  const twin = matchSessions(tesla, [session], now).pairs.find((p) => p.stream)?.tesla ?? null;
  const curve = chargeCurve({
    power: fromStart(read(powerField), session.started_at, false),
    level: fromStart(read("BatteryLevel"), session.started_at, true),
    tempMin: fromStart(read("ModuleTempMin"), session.started_at, true),
    tempMax: fromStart(read("ModuleTempMax"), session.started_at, true),
    end,
  });
  return { session, tesla: twin, curve };
}
