import { splitSite } from "@/lib/charge-sessions";
import { type LatLng, type NameTarget, tagAt, targetTag, type UserPlace } from "@/lib/user-places";

// What to call a place (where a charge happened, where the car parked, where a trip began or ended), best
// source first. Pure, so tested directly.
//
// - tag: the owner's own typed name for the spot (lib/user-places.ts). Always first.
// - invoice: the attached invoice's network and station, as printed: the bill names the exact station.
// - station: the station check's match from OpenStreetMap ("Operator, Area").
// - supercharger: Tesla's site for a Supercharger ("City, Site").
// - place: the cached area name for the spot (lib/server/place-names.ts).
//
// The source travels with the text: OpenStreetMap's names (stations and places) need its credit.
export type ChargeNameSource = "tag" | "station" | "invoice" | "supercharger" | "place";
export type ChargeName = { text: string; source: ChargeNameSource };

export type ChargeNameParts = {
  tag?: string | null;
  station?: string | null;
  invoice?: { network: string | null; station?: string | null } | null;
  site?: string | null;
  place?: string | null;
};

const clean = (s: string | null | undefined) => s?.trim() || null;

// "VoltPoint" and "Lakeview Fuels, Ring Road, Hillgrove" make "VoltPoint, Lakeview Fuels": the network
// and the first part of the station's address. A station that already names the network is used
// alone; with no station, the network alone.
export function invoiceName(network: string | null, station?: string | null): string | null {
  const net = clean(network);
  const first = clean(clean(station)?.split(",")[0]);
  if (!first) return net;
  if (!net || first.toLowerCase().includes(net.toLowerCase())) return first;
  return `${net}, ${first}`;
}

export function chargeName({ tag, station, invoice, site, place }: ChargeNameParts): ChargeName | null {
  const own = clean(tag);
  if (own) return { text: own, source: "tag" };
  const billed = invoice ? invoiceName(invoice.network, invoice.station) : null;
  if (billed) return { text: billed, source: "invoice" };
  const named = clean(station);
  if (named) return { text: named, source: "station" };
  const siteName = clean(site);
  if (siteName) return { text: `Supercharger, ${splitSite(siteName).place}`, source: "supercharger" };
  const area = clean(place);
  if (area) return { text: area, source: "place" };
  return null;
}

// A spot's names and what "Name this place" needs.
// - name: never Google's, so it may go anywhere: map pins, tooltips, charts, the MCP export. The owner's
//   typed tag comes first; a tag that is a Google place falls through to the station, invoice, site or area.
// - google: that Google place's name, fetched live (lib/server/google-place-names.ts), or null. Only rows,
//   lists, titles and the naming sheet show it, each with "Google Maps" beside it. Never on a map.
export type SpotName = { name: ChargeName | null; google: string | null; target: NameTarget };

export function spotName(tags: readonly UserPlace[], spot: LatLng, parts: Omit<ChargeNameParts, "tag"> = {}): SpotName {
  const tag = tagAt(tags, spot);
  return {
    name: chargeName({ ...parts, tag: tag?.name }),
    google: null,
    target: { lat: spot.lat, lng: spot.lng, tag: tag ? targetTag(tag) : null },
  };
}

// What a map pin, its label or tooltip shows: never the Google name, even once it is filled in. Every pin
// builder goes through here.
export const mapName = (spot: Pick<SpotName, "name"> | null | undefined): string | null => spot?.name?.text ?? null;

// What a row or title shows: the Google place's name when there is one (credited), else the safe name.
export type ShownName = { text: string; google: boolean };
export function shownName(spot: Pick<SpotName, "name" | "google"> | null | undefined): ShownName | null {
  if (spot?.google) return { text: spot.google, google: true };
  return spot?.name ? { text: spot.name.text, google: false } : null;
}

// A trip page's route line ("Home to Eswaran Maligai Store"): each end as a row shows it, a picked Google
// place by its Google name. Only when both ends are known, as the trips list does. It sits above the page,
// apart from the map, whose From and To keep the safe name.
export function tripRoute(from: Pick<SpotName, "name" | "google"> | null, to: Pick<SpotName, "name" | "google"> | null): [ShownName, ShownName] | null {
  const ends = [shownName(from), shownName(to)];
  return ends[0] && ends[1] ? [ends[0], ends[1]] : null;
}

// Whether to offer "Name this place": nothing names the spot, or only its area does.
export const needsName = (name: ChargeName | null): boolean => !name || name.source === "place";

// What the sheet's trigger is beside a name: the pencil for any tagged spot (typed or Google), the words
// "Name this place" where nothing better than the area names it, else nothing.
export function nameAction(spot: Pick<SpotName, "name" | "target">): "rename" | "name" | null {
  if (spot.target.tag) return "rename";
  return needsName(spot.name) ? "name" : null;
}

// The car's own flags for where it parked, kept as a small tag after the name ("Koramangala, Bengaluru ·
// Home"), or alone when nothing else names the spot.
export type CarFlag = "home" | "work" | "favorite";
export const CAR_FLAGS: Record<CarFlag, string> = { home: "Home", work: "Work", favorite: "Favourite" };

export function withCarFlag(name: string | null, flag: CarFlag | null): string | null {
  const word = flag ? CAR_FLAGS[flag] : null;
  if (!name) return word;
  return word && name.toLowerCase() !== word.toLowerCase() ? `${name} · ${word}` : name;
}

// What kind of charge it was, for when no name is known and as the line under one that is.
export function chargeType(s: { kind: "ac" | "dc"; supercharger: boolean }): string {
  if (s.supercharger) return "Supercharger";
  return s.kind === "dc" ? "Third-party charger" : "AC charging";
}

// Where the car was when a charge started: the last Location reading within 10 minutes either side.
export const SPOT_WITHIN_MS = 10 * 60_000;
export function chargeSpot(readings: { at: string; value: unknown }[], start: number): { lat: number; lng: number } | null {
  const near = readings.filter((r) => Math.abs(Date.parse(r.at) - start) <= SPOT_WITHIN_MS);
  const v = near.at(-1)?.value as { latitude?: unknown; longitude?: unknown } | undefined;
  const lat = typeof v?.latitude === "string" ? Number(v.latitude) : v?.latitude;
  const lng = typeof v?.longitude === "string" ? Number(v.longitude) : v?.longitude;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

// A link that opens the spot in Google Maps.
export function googleMapsUrl(p: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}
