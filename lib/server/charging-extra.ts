import "server-only";
import type { Owner } from "./data/owner";
import type { MapPin } from "@/components/stats/trip-map";
import { chargeName, chargeSpot, chargeType } from "@/lib/charge-names";
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

// What the charging page adds from the stream: the latest CURVES DC charges as power against battery level
// (TeslaMate's DC charging curve), and where each of the latest PINNED charges happened, for the map.
// `sessions` come newest first; see heldFrom for where each list stops. Each pin is named from the best
// source known (see chargeName); the area name is read from the names already kept, never looked up here.
export async function loadChargingExtras(owner: Owner, vin: string | null, sessions: StreamChargeSession[], sources: NameSources): Promise<{ curves: Curve[]; pins: MapPin[] }> {
  if (!vin) return { curves: [], pins: [] };
  const finished = sessions.filter((s) => s.ended_at !== null);
  const dc = finished.filter((s) => s.kind === "dc").slice(0, CURVES);
  const sites = new Map(matchSessions(sources.tesla, finished, sources.now).pairs.flatMap((p) => (p.stream ? [[p.stream.id, p.tesla.site_name] as const] : [])));
  const nameOf = (s: StreamChargeSession, place?: string | null) => {
    const invoice = sources.invoices.get(s.id);
    return chargeName({ station: s.supercharger ? null : s.station_name, invoice: invoice ? { network: invoice.network, station: invoice.station } : null, site: sites.get(s.id), place });
  };
  const [curves, spots] = await Promise.all([
    Promise.all(
      dc.map(async (s): Promise<Curve | null> => {
        // Read as the session page reads it, so the two show the same charge.
        const r = await loadChargeSeries(owner, s, Date.parse(s.ended_at!), false);
        if (!r) return null;
        const points = powerByLevel({ power: r.power, level: r.level, start: Date.parse(s.started_at), end: r.end, startLevel: s.start_level, endLevel: s.end_level });
        return points.length >= 2
          ? {
              id: s.id,
              name: nameOf(s)?.text ?? (s.supercharger ? "Supercharger" : "Other DC charger"),
              date: s.started_at,
              supercharger: s.supercharger,
              points,
              ...powerFigures(r.power, r.end, s.peak_power_kw),
            }
          : null;
      }),
    ),
    Promise.all(
      finished.slice(0, PINNED).map(async (s) => {
        const t = Date.parse(s.started_at);
        const r = await loadReadingsByField(owner, vin, ["Location"], new Date(t - 10 * MIN).toISOString(), new Date(t + 10 * MIN).toISOString());
        const spot = chargeSpot(r?.Location ?? [], t);
        return spot ? { s, t, ...spot } : null;
      }),
    ),
  ]);
  const located = spots.filter((p) => p !== null);
  // Only the spots no better source names need an area name.
  const places = await cachedPlaceNames(located.filter(({ s }) => !nameOf(s))).catch(() => new Map<string, string>());
  const pins = located.map(({ s, t, lat, lng }): MapPin => {
    const kwh = s.energy_added_kwh ?? 0;
    const name = nameOf(s, places.get(placeKey({ lat, lng })));
    return {
      lat,
      lng,
      t,
      kind: "charge",
      // 24px for a top-up, up to 44px for a big charge (about 50 kWh).
      size: Math.min(44, 24 + Math.sqrt(kwh) * 2.8),
      name: name?.text,
      label: name?.text ?? chargeType(s),
      note: [`${formatShortDate(s.started_at)}, ${formatClock(s.started_at)}`, s.energy_added_kwh !== null ? `${formatKwh(s.energy_added_kwh)} added` : null].filter(Boolean).join(" · "),
    };
  });
  return { curves: curves.filter((c): c is Curve => c !== null), pins };
}

// Where the curves and the pins stop, for sessions newest first: the start of the oldest charge each could
// hold when its cap cut older ones off, else null (every charge is in).
export function heldFrom(sessions: StreamChargeSession[]): { curves: number | null; pins: number | null } {
  const finished = sessions.filter((s) => s.ended_at !== null);
  const at = (s: StreamChargeSession) => Date.parse(s.started_at);
  return { curves: cappedFrom(finished.filter((s) => s.kind === "dc"), CURVES, at), pins: cappedFrom(finished, PINNED, at) };
}
