import "server-only";
import type { MapPin } from "@/components/stats/trip-map";
import { formatShortDate } from "@/lib/format";
import { num, type Reading } from "@/lib/telemetry-derive";
import type { StreamChargeSession } from "./stream-charging";
import { loadReadingsByField } from "./telemetry-window";

const MIN = 60_000;
const CURVES = 8;
const PINNED = 60;

export type Curve = { name: string; points: { x: number; y: number }[] };

const valueAt = (readings: Reading[], t: number) => num(readings.findLast((r) => Date.parse(r.at) <= t)?.value);

// What the charging page adds from the stream: the last few DC charges as power against battery level
// (TeslaMate's DC charging curve), and where each charge happened, for the map.
export async function loadChargingExtras(vin: string | null, sessions: StreamChargeSession[]): Promise<{ curves: Curve[]; pins: MapPin[] }> {
  if (!vin) return { curves: [], pins: [] };
  const finished = sessions.filter((s) => s.ended_at !== null);
  const dc = finished.filter((s) => s.kind === "dc").slice(0, CURVES);
  const [curves, pins] = await Promise.all([
    Promise.all(
      dc.map(async (s): Promise<Curve | null> => {
        const from = new Date(Date.parse(s.started_at) - 10 * MIN).toISOString();
        const r = await loadReadingsByField(vin, ["DCChargingPower", "BatteryLevel"], from, s.ended_at!);
        if (!r) return null;
        const points = r.DCChargingPower.flatMap((p) => {
          const kw = num(p.value);
          const level = valueAt(r.BatteryLevel, Date.parse(p.at));
          return kw === null || level === null || kw <= 0 ? [] : [{ x: level, y: kw }];
        });
        return points.length >= 2 ? { name: `${formatShortDate(s.started_at)}${s.station_name ? `, ${s.station_name}` : ""}`, points } : null;
      }),
    ),
    Promise.all(
      finished.slice(0, PINNED).map(async (s): Promise<MapPin | null> => {
        const t = Date.parse(s.started_at);
        const r = await loadReadingsByField(vin, ["Location"], new Date(t - 10 * MIN).toISOString(), new Date(t + 10 * MIN).toISOString());
        const v = r?.Location.at(-1)?.value as { latitude?: number; longitude?: number } | undefined;
        const [lat, lng] = [num(v?.latitude), num(v?.longitude)];
        if (lat === null || lng === null) return null;
        const kwh = s.energy_added_kwh ?? 0;
        return {
          lat,
          lng,
          t,
          kind: "place",
          size: 5 + Math.sqrt(kwh) * 1.5,
          label: [s.station_name ?? "Charge", formatShortDate(s.started_at), `${Math.round(kwh * 10) / 10} kWh`].join(" · "),
        };
      }),
    ),
  ]);
  return { curves: curves.filter((c): c is Curve => c !== null), pins: pins.filter((p): p is MapPin => p !== null) };
}
