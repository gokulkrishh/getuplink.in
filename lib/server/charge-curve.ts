import "server-only";
import { type SessionInvoice, sessionInvoice } from "./receipts";
import { type ChargeCurve, chargeCurve } from "@/lib/charge-curve";
import { matchSessions } from "@/lib/charge-sessions";
import { DEMO } from "@/lib/demo";
import type { Reading } from "@/lib/telemetry-derive";
import { type FeeLines, feeLines } from "@/lib/charge-fees";
import { type ChargingSession, loadChargingFees, loadChargingSessions } from "./charging";
import { demoStreamSessions } from "./demo";
import { selectSessions, type StreamChargeSession, toStreamSession } from "./stream-charging";
import { type Owner, ownerDb } from "./data/owner";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60 * 1000;
// A level or temperature sent this long before the start still describes the battery at the start.
const LEAD_MS = 60 * MIN;

// invoice: a third-party invoice attached through the MCP connector (lib/server/receipts.ts). fees: the
// matching Supercharger bill's fee lines, when Tesla sent any it could read.
export type ChargeDetail = { session: StreamChargeSession; tesla: ChargingSession | null; invoice: SessionInvoice | null; curve: ChargeCurve; fees: FeeLines | null };

async function loadStreamSession(owner: Owner, id: number): Promise<StreamChargeSession | null> {
  if (DEMO) return demoStreamSessions().find((s) => s.id === id) ?? null;
  const { data, error } = await selectSessions((columns) => ownerDb(owner).from("stream_charge_sessions").select(columns).eq("id", id).maybeSingle());
  if (error) {
    console.warn("Streamed charging session unavailable:", error.message);
    return null;
  }
  // A select built from a string has no row type.
  return data ? toStreamSession(data as unknown as Record<string, unknown>) : null;
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
export async function loadChargeDetail(owner: Owner, id: number, now: number): Promise<ChargeDetail | null> {
  const session = await loadStreamSession(owner, id);
  if (!session) return null;
  const end = session.ended_at ? Date.parse(session.ended_at) : now;
  const from = new Date(Date.parse(session.started_at) - LEAD_MS).toISOString();
  // The 0 kW reading that closes a session can land just after its end.
  const to = new Date(end + MIN).toISOString();
  const powerField = session.kind === "dc" ? "DCChargingPower" : "ACChargingPower";
  const [byField, tesla, invoice] = await Promise.all([
    loadReadingsByField(owner, session.vin, [powerField, "BatteryLevel", "ModuleTempMin", "ModuleTempMax"], from, to),
    loadChargingSessions(owner),
    session.supercharger ? null : sessionInvoice(owner, session.id),
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
  const fees = twin ? feeLines(await loadChargingFees(owner, twin.session_id), twin.cost_total) : null;
  return { session, tesla: twin, invoice, curve, fees };
}
