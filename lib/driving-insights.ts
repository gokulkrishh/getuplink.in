import { acSettingOf, type ClimateReadings } from "@/lib/drive-climate";
import type { Drive } from "@/lib/drives";

// Driving insights after TeslaMate's drive stats, efficiency and locations, from streamed readings.
// Pure, so tested directly.

export type TimedValue = { t: number; v: number };
export type LatLng = { t: number; lat: number; lng: number };

const HOLD_MS = 60_000; // a speed reading counts for at most a minute, if the next one is late

export const SPEED_BINS = [0, 20, 40, 60, 80, 100];

// Share of driving time in each speed band (km/h): each reading holds until the next, at most HOLD_MS,
// and only inside a drive.
export function speedHistogram(speeds: TimedValue[], drives: Drive[]): { from: number; to: number | null; share: number }[] {
  const time = SPEED_BINS.map(() => 0);
  const inDrive = (t: number) => drives.some((d) => t >= d.start && t <= d.end);
  speeds.forEach((p, k) => {
    if (!inDrive(p.t)) return;
    const next = speeds[k + 1]?.t ?? p.t + HOLD_MS;
    const held = Math.min(HOLD_MS, next - p.t);
    const bin = SPEED_BINS.findLastIndex((b) => p.v >= b);
    time[Math.max(0, bin)] += held;
  });
  const total = time.reduce((a, b) => a + b, 0);
  if (!total) return [];
  return SPEED_BINS.map((from, k) => ({ from, to: SPEED_BINS[k + 1] ?? null, share: time[k] / total }));
}

export type Band = { label: string; drives: number; km: number; kmPerKwh: number | null };

// km per kWh for drives grouped into bands of outside temperature and of average speed. Drives without
// energy, under 1 km, or without a temperature (for that table) are left out. The AC table groups by the set
// temperature a drive mostly ran at, or "AC off" (lib/drive-climate.ts acSettingOf); a drive the car sent no
// climate for is left out of it, not counted as off.
export function efficiencyBands(drives: Drive[], temps: TimedValue[], climate?: ClimateReadings): { byTemp: Band[]; bySpeed: Band[]; byAc: Band[] } {
  const usable = drives.filter((d) => d.kwh !== null && d.kwh > 0 && d.km >= 1);
  const median = (vs: number[]) => (vs.length ? [...vs].sort((a, b) => a - b)[Math.floor(vs.length / 2)] : null);
  const band = (label: string, list: Drive[]): Band => {
    const km = list.reduce((s, d) => s + d.km, 0);
    const kwh = list.reduce((s, d) => s + d.kwh!, 0);
    return { label, drives: list.length, km, kmPerKwh: kwh > 0 ? km / kwh : null };
  };
  // The reading in force when the drive started (within 30 minutes), then those during it, like the drive page.
  const tempOf = (d: Drive) => {
    const atStart = temps.findLast((p) => p.t <= d.start && p.t >= d.start - 30 * 60_000);
    return median([...(atStart ? [atStart.v] : []), ...temps.filter((p) => p.t > d.start && p.t <= d.end).map((p) => p.v)]);
  };
  const speedOf = (d: Drive) => d.km / ((d.end - d.start) / 3_600_000);
  const group = (edges: number[], unit: string, value: (d: Drive) => number | null): Band[] =>
    edges
      .map((from, k) => {
        const to = edges[k + 1];
        const label = k === 0 ? `Under ${to} ${unit}` : to === undefined ? `${from} ${unit} and above` : `${from} to ${to} ${unit}`;
        return band(
          label,
          usable.filter((d) => {
            const v = value(d);
            return v !== null && (k === 0 ? v < to : v >= from && (to === undefined || v < to));
          }),
        );
      })
      .filter((b) => b.drives > 0);
  // "AC off", then the set temperature's bands, labelled like the other tables.
  const settings = new Map(climate ? usable.map((d) => [d, acSettingOf(climate, { start: d.start, end: d.end })] as const) : []);
  const setting = (d: Drive) => settings.get(d) ?? null;
  const byAc = [
    band("AC off", usable.filter((d) => setting(d) === "off")),
    ...group([0, 21, 23, 25], "°C", (d) => {
      const v = setting(d);
      return typeof v === "number" ? v : null;
    }),
  ].filter((b) => b.drives > 0);
  return { byTemp: group([0, 20, 25, 30, 35], "°C", tempOf), bySpeed: group([0, 20, 40, 60, 80], "km/h", speedOf), byAc };
}

export type Place = { lat: number; lng: number; visits: number; parkedMs: number; tag: "home" | "work" | "favorite" | null; lastVisit: number };

const RADIUS_M = 150;
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
};

// Where the car parked: each drive's end, joined with others within RADIUS_M, with how many times and how
// long it stayed (until the next drive, or now). Home, Work and Favorite come from the car's own flags.
export function places(drives: Drive[], locations: LatLng[], flags: { home: TimedValue[]; work: TimedValue[]; favorite: TimedValue[] }, now: number): Place[] {
  const sorted = [...drives].sort((a, b) => a.start - b.start);
  const near = (t: number) => {
    const best = locations.reduce<LatLng | null>((a, p) => (!a || Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), null);
    return best && Math.abs(best.t - t) <= 5 * 60_000 ? best : null;
  };
  const flagAt = (list: TimedValue[], t: number) => (list.findLast((p) => p.t <= t + 60_000)?.v ?? 0) > 0;
  const out: Place[] = [];
  sorted.forEach((d, k) => {
    const at = near(d.end);
    if (!at) return;
    const parkedMs = (sorted[k + 1]?.start ?? now) - d.end;
    const tag = flagAt(flags.home, d.end) ? "home" : flagAt(flags.work, d.end) ? "work" : flagAt(flags.favorite, d.end) ? "favorite" : null;
    const place = out.find((p) => metres(p, at) <= RADIUS_M);
    if (place) {
      place.visits++;
      place.parkedMs += parkedMs;
      place.lastVisit = Math.max(place.lastVisit, d.end);
      place.tag ??= tag;
    } else {
      out.push({ lat: at.lat, lng: at.lng, visits: 1, parkedMs, tag, lastVisit: d.end });
    }
  });
  return out.sort((a, b) => b.parkedMs - a.parkedMs);
}
