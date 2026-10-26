import "server-only";
import type { Owner } from "./data/owner";
import type { MapPin } from "@/components/stats/trip-map";
import { chargeName, chargeSpot, chargeType, mapName, type SpotName, spotName } from "@/lib/charge-names";

import { loadUserPlaces } from "./user-places";
import { matchSessions } from "@/lib/charge-sessions";
import { formatClock, formatKwh, formatShortDate } from "@/lib/format";
import { cappedFrom } from "@/lib/kept";
import { powerByLevel, powerFigures } from "@/lib/charge-curve";
import type { ChargingSession } from "./charging";
import { loadChargeSeries } from "./charge-curve";
import { cachedPlaceNames, placeKey } from "./place-names";
import type { SessionInvoiceAmount } from "./receipts";
import type { StreamChargeSession } from "./stream-charging";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60_000;
export const CURVES = 8;
export const PINNED = 60;

// One DC charge: its stream session, power against battery level, who ran the charger, and its peak and
// average power as the session page gives them (powerFigures).
export type Curve = {
  id: number;
  name: string;
  date: string;
  supercharger: boolean;
  points: { x: number; y: number }[];
  peakKw: number | null;
  avgKw: number | null;
};

// What names a charge besides the session itself: Tesla's sessions (a Supercharger's site), the attached
// invoices, and the time for pairing them.
export type NameSources = { tesla: ChargingSession[]; invoices: ReadonlyMap<number, SessionInvoiceAmount>; now: number };

// The parts that name a charge besides its spot: the station check's name, the invoice, Tesla's site.
function nameParts(sessions: StreamChargeSession[], sources: NameSources) {
  const sites = new Map(matchSessions(sources.tesla, sessions, sources.now).pairs.flatMap((p) => (p.stream ? [[p.stream.id, p.tesla.site_name] as const] : [])));
  return (s: StreamChargeSession, place?: string | null) => {
    const invoice = sources.invoices.get(s.id);
    return { station: s.supercharger ? null : s.station_name, invoice: invoice ? { network: invoice.network, station: invoice.station } : null, site: sites.get(s.id), place };
  };
}

type Located = { s: StreamChargeSession; t: number; lat: number; lng: number };

// Where each charge started (one small Location read each), named best source first (see spotName): the
// owner's tag, then the parts above, then the area name already kept, never looked up here.
async function locateAndName(owner: Owner, vin: string, sessions: StreamChargeSession[], sources: NameSources): Promise<{ located: Located[]; named: Map<number, SpotName> }> {
  const partsOf = nameParts(sessions, sources);
  const [spots, tags] = await Promise.all([
    Promise.all(
      sessions.map(async (s): Promise<Located | null> => {
        const t = Date.parse(s.started_at);
        const r = await loadReadingsByField(owner, vin, ["Location"], new Date(t - 10 * MIN).toISOString(), new Date(t + 10 * MIN).toISOString());
        const spot = chargeSpot(r?.Location ?? [], t);
        return spot ? { s, t, ...spot } : null;
      }),
    ),
    loadUserPlaces(owner),
  ]);
  const located = spots.filter((p) => p !== null);
  // Only the spots no better source names need an area name.
  const places = await cachedPlaceNames(located.filter(({ s }) => !chargeName(partsOf(s)))).catch(() => new Map<string, string>());
  const named = new Map(located.map(({ s, lat, lng }) => [s.id, spotName(tags, { lat, lng }, partsOf(s, places.get(placeKey({ lat, lng }))))] as const));
  return { located, named };
}

// The names of the given charges' spots by session id, for a list of them (the home page's).
export async function loadChargeSpots(owner: Owner, vin: string | null, sessions: StreamChargeSession[], sources: NameSources): Promise<Record<number, SpotName>> {
  if (!vin || sessions.length === 0) return {};
  // Google-free on purpose: the home page refreshes every minute while the car is awake or charging, and a
  // live Google name there would cost a Place Details call per refresh. A Google-tagged spot shows its area.
  return Object.fromEntries((await locateAndName(owner, vin, sessions, sources)).named);
}

// What the charging page adds from the stream: the latest CURVES DC charges as power against battery level
// (TeslaMate's DC charging curve), and where each of the latest PINNED charges happened, for the map.
// `sessions` come newest first; see heldFrom for where each list stops. spots: each pinned charge's name by
// session id, for the session list's rows, and the same name on each pin.
export type ChargingExtras = { curves: Curve[]; pins: MapPin[]; spots: Record<number, SpotName> };

export async function loadChargingExtras(owner: Owner, vin: string | null, sessions: StreamChargeSession[], sources: NameSources): Promise<ChargingExtras> {
  if (!vin) return { curves: [], pins: [], spots: {} };
  const finished = sessions.filter((s) => s.ended_at !== null);
  const dc = finished.filter((s) => s.kind === "dc").slice(0, CURVES);
  const partsOf = nameParts(finished, sources);
  const [curves, { located, named }] = await Promise.all([
    Promise.all(
      dc.map(async (s): Promise<Curve | null> => {
        // Read as the session page reads it, so the two show the same charge.
        const r = await loadChargeSeries(owner, s, Date.parse(s.ended_at!), false);
        if (!r) return null;
        const points = powerByLevel({ power: r.power, level: r.level, start: Date.parse(s.started_at), end: r.end, startLevel: s.start_level, endLevel: s.end_level });
        return points.length >= 2
          ? {
              id: s.id,
              name: chargeName(partsOf(s))?.text ?? (s.supercharger ? "Supercharger" : "Other DC charger"),
              date: s.started_at,
              supercharger: s.supercharger,
              points,
              ...powerFigures(r.power, r.end, s.peak_power_kw),
            }
          : null;
      }),
    ),
    locateAndName(owner, vin, finished.slice(0, PINNED), sources),
  ]);
  const pins = located.map(({ s, t, lat, lng }): MapPin => {
    const kwh = s.energy_added_kwh ?? 0;
    const name = mapName(named.get(s.id));
    return {
      lat,
      lng,
      t,
      kind: "charge",
      // 24px for a top-up, up to 44px for a big charge (about 50 kWh).
      size: Math.min(44, 24 + Math.sqrt(kwh) * 2.8),
      name: name ?? undefined,
      label: name ?? chargeType(s),
      note: [`${formatShortDate(s.started_at)}, ${formatClock(s.started_at)}`, s.energy_added_kwh !== null ? `${formatKwh(s.energy_added_kwh)} added` : null].filter(Boolean).join(" · "),
    };
  });
  // A curve takes the owner's name for its charger, when they gave one.
  const tagged = (id: number) => {
    const name = named.get(id)?.name;
    return name?.source === "tag" ? name.text : null;
  };
  const kept = curves.filter((c): c is Curve => c !== null).map((c) => ({ ...c, name: tagged(c.id) ?? c.name }));
  return { curves: kept, pins, spots: Object.fromEntries(named) };
}

// Where the curves and the pins stop, for sessions newest first: the start of the oldest charge each could
// hold when its cap cut older ones off, else null (every charge is in).
export function heldFrom(sessions: StreamChargeSession[]): { curves: number | null; pins: number | null } {
  const finished = sessions.filter((s) => s.ended_at !== null);
  const at = (s: StreamChargeSession) => Date.parse(s.started_at);
  return { curves: cappedFrom(finished.filter((s) => s.kind === "dc"), CURVES, at), pins: cappedFrom(finished, PINNED, at) };
}
