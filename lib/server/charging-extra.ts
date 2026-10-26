import "server-only";
import type { Owner } from "./data/owner";
import type { MapPin } from "@/components/stats/trip-map";
import { formatKwh, formatShortDate } from "@/lib/format";
import { cappedFrom } from "@/lib/kept";
import { num, type Reading } from "@/lib/telemetry-derive";
import type { StreamChargeSession } from "./stream-charging";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60_000;
export const CURVES = 8;
export const PINNED = 60;

// One DC charge: its stream session, power against battery level, and who ran the charger.
export type Curve = { id: number; name: string; date: string; supercharger: boolean; points: { x: number; y: number }[] };

const valueAt = (readings: Reading[], t: number) => num(readings.findLast((r) => Date.parse(r.at) <= t)?.value);

// What the charging page adds from the stream: the latest CURVES DC charges as power against battery level
// (TeslaMate's DC charging curve), and where each of the latest PINNED charges happened, for the map.
// `sessions` come newest first; see heldFrom for where each list stops.
export async function loadChargingExtras(owner: Owner, vin: string | null, sessions: StreamChargeSession[]): Promise<{ curves: Curve[]; pins: MapPin[] }> {
  if (!vin) return { curves: [], pins: [] };
  const finished = sessions.filter((s) => s.ended_at !== null);
  const dc = finished.filter((s) => s.kind === "dc").slice(0, CURVES);
  const [curves, pins] = await Promise.all([
    Promise.all(
      dc.map(async (s): Promise<Curve | null> => {
        const from = new Date(Date.parse(s.started_at) - 10 * MIN).toISOString();
        const r = await loadReadingsByField(owner, vin, ["DCChargingPower", "BatteryLevel"], from, s.ended_at!);
        if (!r) return null;
        const points = r.DCChargingPower.flatMap((p) => {
          const kw = num(p.value);
          const level = valueAt(r.BatteryLevel, Date.parse(p.at));
          return kw === null || level === null || kw <= 0 ? [] : [{ x: level, y: kw }];
        });
        return points.length >= 2
          ? { id: s.id, name: s.supercharger ? "Supercharger" : (s.station_name ?? "Other DC charger"), date: s.started_at, supercharger: s.supercharger, points }
          : null;
      }),
    ),
    Promise.all(
      finished.slice(0, PINNED).map(async (s): Promise<MapPin | null> => {
        const t = Date.parse(s.started_at);
        const r = await loadReadingsByField(owner, vin, ["Location"], new Date(t - 10 * MIN).toISOString(), new Date(t + 10 * MIN).toISOString());
        const v = r?.Location.at(-1)?.value as { latitude?: number; longitude?: number } | undefined;
        const [lat, lng] = [num(v?.latitude), num(v?.longitude)];
        if (lat === null || lng === null) return null;
        const kwh = s.energy_added_kwh ?? 0;
        return {
          lat,
          lng,
          t,
          kind: "charge",
          // 24px for a top-up, up to 44px for a big charge (about 50 kWh).
          size: Math.min(44, 24 + Math.sqrt(kwh) * 2.8),
          label: [s.station_name ?? "Charge", formatShortDate(s.started_at), formatKwh(kwh)].join(" · "),
        };
      }),
    ),
  ]);
  return { curves: curves.filter((c): c is Curve => c !== null), pins: pins.filter((p): p is MapPin => p !== null) };
}

// Where the curves and the pins stop, for sessions newest first: the start of the oldest charge each could
// hold when its cap cut older ones off, else null (every charge is in).
export function heldFrom(sessions: StreamChargeSession[]): { curves: number | null; pins: number | null } {
  const finished = sessions.filter((s) => s.ended_at !== null);
  const at = (s: StreamChargeSession) => Date.parse(s.started_at);
  return { curves: cappedFrom(finished.filter((s) => s.kind === "dc"), CURVES, at), pins: cappedFrom(finished, PINNED, at) };
}
