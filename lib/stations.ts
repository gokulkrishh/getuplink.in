// Names the charging station at a point, from OpenStreetMap's stations (lib/station-data.ts). Pure and in
// memory: the point never leaves the caller, and only the label is meant to be kept.
import { STATIONS } from "@/lib/station-data";

// A car parked at a charger is within this of the station's mapped point; nearest wins.
export const MATCH_METRES = 150;

export const OSM_CREDIT = "© OpenStreetMap contributors, ODbL";

type Station = [name: string, operator: string, area: string, lat: number, lon: number];

// "Operator, Area" when both are known, else the name, else the operator alone.
export function stationLabel([name, operator, area]: Station): string | null {
  if (operator && area) return `${operator}, ${area}`;
  return name || operator || null;
}

function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

// The label of the nearest station within MATCH_METRES, or null. About 300 stations, so a plain scan.
export function stationAt(lat: number, lon: number, stations: Station[] = STATIONS): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: Station | null = null;
  let bestM = MATCH_METRES;
  for (const s of stations) {
    const d = metres(lat, lon, s[3], s[4]);
    if (d <= bestM) [best, bestM] = [s, d];
  }
  return best ? stationLabel(best) : null;
}

// Every station's label within MATCH_METRES, nearest first, for the suggestions in "Name this place".
export function stationsNear(lat: number, lon: number, stations: Station[] = STATIONS): string[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return stations
    .map((s) => ({ s, d: metres(lat, lon, s[3], s[4]) }))
    .filter((x) => x.d <= MATCH_METRES)
    .sort((a, b) => a.d - b.d)
    .flatMap(({ s }) => stationLabel(s) ?? []);
}
