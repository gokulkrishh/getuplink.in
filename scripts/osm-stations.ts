#!/usr/bin/env bun
// Rebuild lib/station-data.ts: India's car charging stations from OpenStreetMap, for naming the station a
// streamed charging session happened at (lib/stations.ts). Run by hand now and then; nothing calls it.
//
//   bun scripts/osm-stations.ts
//
// Two Overpass queries: every amenity=charging_station in India's bounding box, then the named places
// (suburbs, towns, ...) within a few km of them, which give each station its area. The box also takes in
// the neighbours, so a station counts only where the app's own map (stateAt) puts it in India.
// OSM data is © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).

import { writeFileSync } from "node:fs";
import { stateAt } from "@/lib/india-map";

// The main server is the freshest; the mirrors can lag by months, so they're the last resort.
const MAIN = "https://overpass-api.de/api/interpreter";
const ENDPOINTS = [MAIN, MAIN, MAIN, "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const BBOX = "6.5,68,37.2,97.6"; // south, west, north, east: the rollout map's frame
const OUT = new URL("../lib/station-data.ts", import.meta.url);

const STATIONS_QUERY = `[out:json][timeout:240][bbox:${BBOX}];nwr["amenity"="charging_station"];out center tags;`;
// Small places first, larger ones further out: a suburb names a city station, a town a highway one.
const PLACES_QUERY = `[out:json][timeout:240][bbox:${BBOX}];nwr["amenity"="charging_station"]->.s;node(around.s:5000)["place"~"^(neighbourhood|quarter|suburb|village|town|city)$"]["name"];out body;`;

type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
type Answer = { osm3s?: { timestamp_osm_base?: string }; elements: Element[]; remark?: string };

async function overpass(query: string): Promise<Answer> {
  for (const [attempt, url] of ENDPOINTS.entries()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Uplink station extract (getuplink.in)" },
        body: new URLSearchParams({ data: query }),
      });
      const text = await res.text();
      // A busy server answers 429/502/504 with an HTML page; a timed-out query sends JSON with a remark.
      if (res.ok && text.startsWith("{")) {
        const answer = JSON.parse(text) as Answer;
        if (!answer.remark) return answer;
        console.warn(`${url}: ${answer.remark}`);
      } else {
        console.warn(`${url}: ${res.status}`);
      }
    } catch (err) {
      console.warn(`${url}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 10_000 * 2 ** attempt));
  }
  throw new Error("Overpass did not answer");
}

// Some values are all lower case ("tata"); capitalise those, leave the rest as mapped.
function tidy(value: string | undefined): string {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  return v && v === v.toLowerCase() ? v.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : v;
}

// Two-wheeler networks, battery swaps and phone or cycle points sit next to car chargers in malls; a
// Tesla never uses them.
const TWO_WHEELER = /\b(ather|bounce|yulu|battery smart|sun mobility|ola|vida|swap|phone|mobile|cycle|e-?rickshaw)\b/i;
function forCars(tags: Record<string, string>): boolean {
  if (tags.motorcar === "no" || tags["charging_station:battery_swapping"] === "yes") return false;
  // Private chargers are someone's home or office: never name those.
  if (tags.access === "private" || tags.access === "no") return false;
  return !TWO_WHEELER.test(`${tags.brand ?? ""} ${tags.operator ?? ""} ${tags.name ?? ""}`);
}

const SMALL = new Set(["neighbourhood", "quarter", "suburb"]);
const SMALL_KM = 1.5;
const LARGE_KM = 5;

function km(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = (b[0] - a[0]) * rad;
  return Math.hypot(x, y) * 6371;
}

type Place = { name: string; small: boolean; at: [number, number] };

// The station's own address first, then the nearest suburb, then the nearest town or village.
function areaOf(tags: Record<string, string>, at: [number, number], places: Place[]): string {
  const tagged = tidy(tags["addr:suburb"] || tags["addr:neighbourhood"] || tags["addr:place"]);
  if (tagged) return tagged;
  const nearest = (small: boolean, within: number) => {
    let best: Place | null = null;
    let bestKm = within;
    for (const p of places) {
      const d = p.small === small ? km(at, p.at) : Infinity;
      if (d < bestKm) [best, bestKm] = [p, d];
    }
    return best?.name ?? "";
  };
  return nearest(true, SMALL_KM) || tidy(tags["addr:city"]) || nearest(false, LARGE_KM);
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

const stations = await overpass(STATIONS_QUERY);
const placesAnswer = await overpass(PLACES_QUERY);
const places: Place[] = placesAnswer.elements
  .filter((e) => typeof e.lat === "number" && typeof e.lon === "number" && e.tags?.name)
  .map((e) => ({ name: tidy(e.tags!["name:en"] || e.tags!.name), small: SMALL.has(e.tags!.place), at: [e.lat!, e.lon!] }));

const rows: [string, string, string, number, number][] = [];
for (const e of stations.elements) {
  const tags = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number" || !stateAt(lat, lon) || !forCars(tags)) continue;
  const name = tidy(tags["name:en"] || tags.name);
  const operator = tidy(tags["brand:en"] || tags.brand || tags["operator:en"] || tags.operator);
  if (!name && !operator) continue;
  rows.push([name, operator, areaOf(tags, [lat, lon], places), round(lat), round(lon)]);
}
// Sorted, so a rerun only shows what changed on the map.
rows.sort((a, b) => a[3] - b[3] || a[4] - b[4] || a[0].localeCompare(b[0]));

const header = `// Car charging stations in India from OpenStreetMap, for naming where a charging session happened
// (lib/stations.ts). Generated by scripts/osm-stations.ts: do not edit by hand. Data as of
// ${stations.osm3s?.timestamp_osm_base ?? "unknown"}; ${rows.length} stations.
// © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright). Credited wherever a station name shows.
// [name, operator or brand, area, latitude, longitude]; "" where OSM has no value.
`;
const body = rows.map((r) => `  ${JSON.stringify(r)},`).join("\n");
writeFileSync(OUT, `${header}export const STATIONS: [name: string, operator: string, area: string, lat: number, lon: number][] = [\n${body}\n];\n`);
console.log(`${rows.length} stations (of ${stations.elements.length} in the box), ${places.length} places`);
