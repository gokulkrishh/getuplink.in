import "server-only";
import { type SessionInvoice, sessionInvoice } from "./receipts";
import { type ChargeCurve, chargeCurve, fromStart, levelThroughEnd } from "@/lib/charge-curve";
import { chargeSpot, SPOT_WITHIN_MS } from "@/lib/charge-names";
import { levelSeries, type Taper, taperTimes } from "@/lib/charge-tips";
import { matchSessions, SETTLE_MS } from "@/lib/charge-sessions";
import { DEMO } from "@/lib/demo";
import type { Reading } from "@/lib/telemetry-derive";
import { type FeeLines, feeLines } from "@/lib/charge-fees";
import { type ChargingSession, loadChargingFees, loadChargingSessions } from "./charging";
import { demoStreamSessions } from "./demo";
import { cachedPlaceNames, placeKey } from "./place-names";
import { googlePlaceName } from "./google-place-names";
import { loadUserPlaces } from "./user-places";
import { type NameTarget, nameTarget } from "@/lib/user-places";
import { selectSessions, type StreamChargeSession, toStreamSession } from "./stream-charging";
import { type Owner, ownerDb } from "./data/owner";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60 * 1000;
// A level or temperature sent this long before the start still describes the battery at the start.
const LEAD_MS = 60 * MIN;

// invoice: a third-party invoice attached through the MCP connector (lib/server/receipts.ts). fees: the
// matching Supercharger bill's fee lines, when Tesla sent any it could read. spot: where the car was when
// it started, and place: that spot's area name, from the names already kept.
export type ChargeDetail = {
  session: StreamChargeSession;
  tesla: ChargingSession | null;
  invoice: SessionInvoice | null;
  curve: ChargeCurve;
  fees: FeeLines | null;
  spot: { lat: number; lng: number } | null;
  place: string | null;
  // The owner's tag for the spot, if any, and what "Name this place" needs.
  target: NameTarget | null;
  // The tag's Google place name, fetched live, for the title only (credited there).
  google: string | null;
  // Time to 80% and above it, when the charge went past 80% (lib/charge-tips.ts), for the tips.
  taper: Taper | null;
};

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

export type ChargeSeries = { power: Reading[]; level: Reading[]; tempMin: Reading[]; tempMax: Reading[]; end: number };

// A session's power, battery level and (with `temps`) module temperatures, ready for chargeCurve and
// powerByLevel: the session page and the DC charging speed chart read a charge the same way. Null when
// the readings can't be loaded.
export async function loadChargeSeries(owner: Owner, session: StreamChargeSession, now: number, temps = true): Promise<ChargeSeries | null> {
  const end = session.ended_at ? Date.parse(session.ended_at) : now;
  const from = new Date(Date.parse(session.started_at) - LEAD_MS).toISOString();
  // The 0 kW reading that closes a session can land just after its end; the battery level that settles it
  // up to one 5-minute interval after (see levelThroughEnd).
  const cut = end + MIN;
  const to = new Date(Math.max(cut, end + SETTLE_MS)).toISOString();
  const powerField = session.kind === "dc" ? "DCChargingPower" : "ACChargingPower";
  const tempFields = temps ? ["ModuleTempMin", "ModuleTempMax"] : [];
  const byField = await loadReadingsByField(owner, session.vin, [powerField, "BatteryLevel", ...tempFields], from, to);
  if (!byField) return null;
  const read = (field: string) => (byField[field] ?? []).filter((r) => Date.parse(r.at) <= cut);
  return {
    power: fromStart(read(powerField), session.started_at, false),
    level: fromStart(levelThroughEnd(byField.BatteryLevel ?? [], end), session.started_at, true),
    tempMin: fromStart(read("ModuleTempMin"), session.started_at, true),
    tempMax: fromStart(read("ModuleTempMax"), session.started_at, true),
    end,
  };
}

// One streamed session with its readings, and the Supercharger session it matches, if any.
export async function loadChargeDetail(owner: Owner, id: number, now: number): Promise<ChargeDetail | null> {
  const session = await loadStreamSession(owner, id);
  if (!session) return null;
  const start = Date.parse(session.started_at);
  const [series, tesla, invoice, located] = await Promise.all([
    loadChargeSeries(owner, session, now),
    loadChargingSessions(owner),
    session.supercharger ? null : sessionInvoice(owner, session.id),
    // Where the car was when it started, for the area name when nothing better names the charge.
    loadReadingsByField(owner, session.vin, ["Location"], new Date(start - SPOT_WITHIN_MS).toISOString(), new Date(start + SPOT_WITHIN_MS).toISOString()),
  ]);
  const twin = matchSessions(tesla, [session], now).pairs.find((p) => p.stream)?.tesla ?? null;
  const end = session.ended_at ? Date.parse(session.ended_at) : now;
  const curve = chargeCurve(series ?? { power: [], level: [], tempMin: [], tempMax: [], end });
  const spot = chargeSpot(located?.Location ?? [], start);
  const [fees, places, tags] = await Promise.all([
    twin ? loadChargingFees(owner, twin.session_id).then((f) => feeLines(f, twin.cost_total)) : null,
    spot ? cachedPlaceNames([spot]).catch(() => new Map<string, string>()) : new Map<string, string>(),
    spot ? loadUserPlaces(owner) : [],
  ]);
  const target = spot ? nameTarget(tags, spot) : null;
  const google = target?.tag?.googlePlaceId ? await googlePlaceName(target.tag.googlePlaceId) : null;
  const taper = series ? taperTimes(levelSeries(series.level), start, end, session.start_level, session.end_level) : null;
  return { session, tesla: twin, invoice, curve, fees, spot, place: spot ? (places.get(placeKey(spot)) ?? null) : null, target, google, taper };
}
