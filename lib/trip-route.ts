import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { formatClock, formatDuration } from "@/lib/format";
import { fixes, tripEnd } from "@/lib/location";
import type { Reading } from "@/lib/telemetry-derive";
import type { Trip } from "@/lib/trips";

// A trip's route and pins from streamed Location readings. Pure, so tested directly.

const MIN = 60_000;

// The route while each leg was under way, and pins for the start, each stop and the end: each where the car
// was then, by tripEnd (lib/location.ts), the rule the trips list names them by. No such fix, no pin.
export function tripRoute(trip: Trip, readings: Reading[]): { route: MapPoint[]; pins: MapPin[] } {
  const located = fixes(readings);
  const route = trip.legs.flatMap((d) => located.filter((p) => p.t >= d.start - 2 * MIN && p.t <= d.end + 2 * MIN));
  const pins: MapPin[] = [];
  const pin = (t: number, kind: MapPin["kind"], label: string) => {
    const p = tripEnd(located, t, kind === "start" ? "start" : "end");
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
