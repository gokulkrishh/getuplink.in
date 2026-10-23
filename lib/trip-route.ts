import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { formatClock, formatDuration } from "@/lib/format";
import { num, type Reading } from "@/lib/telemetry-derive";
import type { Trip } from "@/lib/trips";

// A trip's route and pins from streamed Location readings. Pure, so tested directly.

const MIN = 60_000;

// A streamed Location value: { latitude, longitude } (some payloads use lat / lng).
function latLng(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const lat = num(v.latitude ?? v.lat);
  const lng = num(v.longitude ?? v.lng ?? v.lon);
  return lat === null || lng === null || (lat === 0 && lng === 0) ? null : { lat, lng };
}

// The route while each leg was under way, and pins for the start, each stop and the end: each the
// reading nearest its moment, if one is within 5 minutes. No reading, no pin.
export function tripRoute(trip: Trip, readings: Reading[]): { route: MapPoint[]; pins: MapPin[] } {
  const located = readings
    .flatMap((r) => {
      const p = latLng(r.value);
      return p ? [{ ...p, t: Date.parse(r.at) }] : [];
    })
    .sort((a, b) => a.t - b.t);
  const route = trip.legs.flatMap((d) => located.filter((p) => p.t >= d.start - 2 * MIN && p.t <= d.end + 2 * MIN));
  const near = (t: number) => {
    const best = located.reduce<MapPoint | null>((a, p) => (!a || Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), null);
    return best && Math.abs(best.t - t) <= 5 * MIN ? best : null;
  };
  const pins: MapPin[] = [];
  const pin = (t: number, kind: MapPin["kind"], label: string) => {
    const p = near(t);
    if (p) pins.push({ ...p, kind, label });
  };
  pin(trip.start, "start", `Start · ${formatClock(trip.start)}`);
  trip.legs.slice(1).forEach((d, k) => {
    const from = trip.legs[k].end;
    pin(from, "stop", `Stop ${k + 1} · ${formatClock(from)} to ${formatClock(d.start)}, ${formatDuration((d.start - from) / 1000)}`);
  });
  pin(trip.end, "end", `End · ${formatClock(trip.end)}`);
  return { route, pins };
}
