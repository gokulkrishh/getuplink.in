import { splitSite } from "@/lib/charge-sessions";

// What to call the place a charge happened, best source first. Pure, so tested directly.
//
// - station: the station check's match from OpenStreetMap ("Operator, Area").
// - invoice: the attached invoice's network and station, as printed.
// - supercharger: Tesla's site for a Supercharger ("City, Site").
// - place: the cached area name for the spot (lib/server/place-names.ts).
//
// The source travels with the text: OpenStreetMap's names (stations and places) need its credit.
export type ChargeNameSource = "station" | "invoice" | "supercharger" | "place";
export type ChargeName = { text: string; source: ChargeNameSource };

export type ChargeNameParts = {
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

export function chargeName({ station, invoice, site, place }: ChargeNameParts): ChargeName | null {
  const named = clean(station);
  if (named) return { text: named, source: "station" };
  const billed = invoice ? invoiceName(invoice.network, invoice.station) : null;
  if (billed) return { text: billed, source: "invoice" };
  const siteName = clean(site);
  if (siteName) return { text: `Supercharger, ${splitSite(siteName).place}`, source: "supercharger" };
  const area = clean(place);
  if (area) return { text: area, source: "place" };
  return null;
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
