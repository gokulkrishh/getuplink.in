// India's state shapes (lib/india-map-data.ts) as SVG paths, and the one projection both the map and the
// home-state lookup use: equirectangular, 20 units a degree, longitude scaled by cos 22° (India's middle)
// so the country keeps its proportions.
import type { StateCode } from "@/lib/india-states";
import { STATE_PATHS } from "@/lib/india-map-data";

const LON0 = 68;
const LAT0 = 37.2;
const K = 20;
const COS = Math.cos((22 * Math.PI) / 180);

// The map's viewBox: 68°E to 97.6°E, 37.2°N to 6.6°N.
export const MAP_WIDTH = Math.ceil((97.6 - LON0) * K * COS);
export const MAP_HEIGHT = Math.ceil((LAT0 - 6.6) * K);

export function project(lat: number, lon: number): [x: number, y: number] {
  return [(lon - LON0) * K * COS, (LAT0 - lat) * K];
}

export { STATE_PATHS };

type Ring = [number, number][];
// "M1 2 3 4 5 6ZM…" -> rings. The data file writes only that form.
function rings(path: string): Ring[] {
  return path
    .split("Z")
    .filter(Boolean)
    .map((ring) => {
      const n = ring.slice(1).split(" ").map(Number);
      const points: Ring = [];
      for (let i = 0; i < n.length; i += 2) points.push([n[i], n[i + 1]]);
      return points;
    });
}

let parsed: [StateCode, Ring[], number][] | undefined;
function shapes() {
  parsed ??= (Object.entries(STATE_PATHS) as [StateCode, string][]).map(([code, path]) => {
    const r = rings(path);
    return [code, r, r.reduce((sum, ring) => sum + Math.abs(area(ring)), 0)];
  });
  return parsed;
}

function area(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

// Even-odd over every ring, so a hole (an enclave) counts as outside.
function inside(x: number, y: number, all: Ring[]): boolean {
  let hit = false;
  for (const ring of all) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

function edgeDistance(x: number, y: number, all: Ring[]): number {
  let best = Infinity;
  for (const ring of all) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j];
      const [bx, by] = ring[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
  }
  return best;
}

// A coast or border point the simplified shapes miss by up to this much (map units, about 15 km) still counts.
const NEAR = 3;

// The state a point is in, worked out in memory from the shapes: no geocoding service sees it. Inside two
// shapes (an enclave whose hole was simplified away) the smaller wins; inside none, the nearest within NEAR.
export function stateAt(lat: number, lon: number): StateCode | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [x, y] = project(lat, lon);
  let best: StateCode | null = null;
  let bestArea = Infinity;
  for (const [code, all, size] of shapes()) {
    if (size < bestArea && inside(x, y, all)) {
      best = code;
      bestArea = size;
    }
  }
  if (best) return best;
  let nearest = NEAR;
  for (const [code, all] of shapes()) {
    const d = edgeDistance(x, y, all);
    if (d < nearest) {
      best = code;
      nearest = d;
    }
  }
  return best;
}
