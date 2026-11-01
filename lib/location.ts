import { num } from "@/lib/telemetry-derive";

// Streamed Location readings, and where the car was when a trip began or ended. Pure and neutral (no page's
// code), so the trip page, the trips list and the parked places all use the same rules.

const MIN = 60_000;

// A streamed Location value: { latitude, longitude } (some payloads use lat / lng or lon, some send strings),
// or null for anything else and for 0, 0 (no fix).
export function latLng(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const lat = num(v.latitude ?? v.lat);
  const lng = num(v.longitude ?? v.lng ?? v.lon);
  return lat === null || lng === null || (lat === 0 && lng === 0) ? null : { lat, lng };
}

export type Fix = { t: number; lat: number; lng: number };

// Readings as fixes, oldest first: only those with a place and a time.
export function fixes(readings: { at: string; value: unknown }[]): Fix[] {
  return readings
    .flatMap((r) => {
      const p = latLng(r.value);
      const t = Date.parse(r.at);
      return p && Number.isFinite(t) ? [{ t, lat: p.lat, lng: p.lng }] : [];
    })
    .sort((a, b) => a.t - b.t);
}

// How far from a trip's start or end a fix still says where the car was. The car sends Location every 10 s
// while driving and only on change once parked, so a parked fix can be long before it sets off; one after it
// stops comes within minutes when it comes at all. A moving fix is trusted only very close to the moment:
// a few minutes into a drive the car can be kilometres away.
export const PARKED_BEFORE_MS = 30 * MIN;
export const PARKED_AFTER_MS = 10 * MIN;
export const MOVING_MS = 60_000;

// The first index whose t is at least m (or above m, with `after`). Fixes with no time are skipped.
function firstFrom<T extends { t: number }>(sorted: T[], m: number, after: boolean): number {
  let [lo, hi] = [0, sorted.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = sorted[mid].t;
    if (Number.isFinite(t) && (after ? t <= m : t < m)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Walks from index k by step while fixes stay within the limit, skipping those with no time.
function walk<T extends { t: number }>(sorted: T[], k: number, step: 1 | -1, ok: (t: number) => boolean): T | null {
  for (let i = k; i >= 0 && i < sorted.length; i += step) {
    const t = sorted[i].t;
    if (!Number.isFinite(t)) continue;
    return ok(t) ? sorted[i] : null;
  }
  return null;
}

// Where the car was at a trip's start or end (or a stop), from fixes sorted oldest first. Where it was parked
// wins: for an end the first fix at or after it within 10 minutes, for a start the last at or before it
// within 30. Else a moving fix within a minute: the last before an end, the first after a start. No such
// fix, null: never a guess. One binary search a call, so a caller can ask for every drive in a period.
export function tripEnd<T extends { t: number }>(sorted: T[], m: number, side: "start" | "end"): T | null {
  if (side === "end") {
    const k = firstFrom(sorted, m, false); // first t >= m
    return walk(sorted, k, 1, (t) => t <= m + PARKED_AFTER_MS) ?? walk(sorted, k - 1, -1, (t) => t >= m - MOVING_MS);
  }
  const k = firstFrom(sorted, m, true); // first t > m
  return walk(sorted, k - 1, -1, (t) => t >= m - PARKED_BEFORE_MS) ?? walk(sorted, k, 1, (t) => t <= m + MOVING_MS);
}
