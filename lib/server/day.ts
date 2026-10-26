import "server-only";
import type { Owner } from "./data/owner";
import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { type Day, dayStrips } from "@/lib/day-timeline";
import { chargeName, chargeSpot, chargeType, type SpotName, spotName } from "@/lib/charge-names";
import { loadUserPlaces } from "./user-places";
import { matchSessions } from "@/lib/charge-sessions";
import { billsIn, chargingBills } from "@/lib/charging-figures";
import { DRIVE_DAYS } from "@/lib/drives";
import { formatClock, formatKwh } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { tripRoute } from "@/lib/trip-route";
import { groupTrips, type Trip } from "@/lib/trips";
import { loadPresence } from "./awake";
import { loadChargingSessions } from "./charging";
import { loadDrivingFigures, loadWindowStats } from "./driving";
import { cachedPlaceNames, placeKey } from "./place-names";
import { invoicesBySession } from "./receipts";
import { loadStreamSessions, type StreamChargeSession } from "./stream-charging";
import { loadPrimaryVehicle } from "./telemetry";
import { loadReadingsByField } from "./telemetry-window";

const DAY = 86_400_000;

export type DayDetail = {
  day: number; // istDay
  strip: Day;
  trips: Trip[]; // newest first
  // Each charge's real bill: Tesla's for a Supercharger, the attached invoice for the rest, else null.
  // name: the station's, the invoice's or the Supercharger site's, when one is known (see chargeName).
  // spot: where it started and its names (see spotName), when the readings show it.
  charges: { session: StreamChargeSession; cost: number | null; name: string | null; spot: SpotName | null }[];
  // The day's spend from real bills, counted as Charging counts it (see chargingBills).
  spent: number;
  route: MapPoint[];
  pins: MapPin[];
  // The days either side that can be shown (within the 90 days of drives, not after today).
  prev: number | null;
  next: number | null;
};

// One IST day: its timeline, trips and charges, and where the car went. Null outside the 90 days Uplink
// keeps drives for, or in the future.
export async function loadDay(owner: Owner, day: number, now: number): Promise<DayDetail | null> {
  const today = istDay(now);
  const first = istDay(now - DRIVE_DAYS * DAY) + 1;
  if (day > today || day < first) return null;
  const vehicle = await loadPrimaryVehicle(owner);
  const vin = vehicle?.vin ?? null;
  const [window, presence, figures, sessions, tesla] = await Promise.all([
    loadWindowStats(owner, vin, now),
    loadPresence(owner, vehicle, now),
    loadDrivingFigures(owner, vin, now),
    loadStreamSessions(owner),
    loadChargingSessions(owner),
  ]);
  const start = istDayStart(day);
  const end = istDayStart(day + 1);
  const strip = dayStrips(
    today - day + 1,
    {
      driving: window.driving.drives,
      charging: sessions.map((s) => ({ start: Date.parse(s.started_at), end: s.ended_at ? Date.parse(s.ended_at) : now })),
      asleep: presence.days.flatMap((d) => d.runs.filter((r) => r.state === "asleep")),
    },
    figures.since,
    now,
  )[0];
  const trips = groupTrips(window.driving.drives).filter((t) => t.start >= start && t.start < end);
  const inDay = (s: { started_at: string }) => Date.parse(s.started_at) >= start && Date.parse(s.started_at) < end;
  const dayCharges = sessions.filter(inDay);
  // Paired over every session, as Charging pairs them, so a charge near midnight finds its bill.
  const { pairs, streamOnly } = matchSessions(tesla, sessions, now);
  const teslaBill = new Map(pairs.flatMap((p) => (p.stream && p.tesla.cost_total !== null ? [[p.stream.id, p.tesla.cost_total] as const] : [])));
  const sites = new Map(pairs.flatMap((p) => (p.stream ? [[p.stream.id, p.tesla.site_name] as const] : [])));
  const invoices = await invoicesBySession(owner, dayCharges.filter((s) => !s.supercharger).map((s) => s.id));
  // Where the car went: each trip's route and its start, stops and end, from one read of the day.
  const located = vin ? ((await loadReadingsByField(owner, vin, ["Location"], new Date(start - 30 * 60_000).toISOString(), new Date(Math.min(end + 30 * 60_000, now)).toISOString()))?.Location ?? []) : [];
  const routes = [...trips].reverse().map((t) => tripRoute(t, located));
  const partsOf = (session: StreamChargeSession) => {
    const invoice = invoices.get(session.id);
    return { station: session.supercharger ? null : session.station_name, invoice: invoice ? { network: invoice.network, station: invoice.station } : null, site: sites.get(session.id) };
  };
  // Each charge where it started, named best source first (see spotName): the owner's tag, the station,
  // invoice or Supercharger site, then the area name already kept.
  const charged = dayCharges.map((session) => ({ session, at: chargeSpot(located, Date.parse(session.started_at)) }));
  const [places, tags] = await Promise.all([
    cachedPlaceNames(charged.flatMap(({ session, at }) => (at && !chargeName(partsOf(session)) ? [at] : []))).catch(() => new Map<string, string>()),
    loadUserPlaces(owner),
  ]);
  const charges = charged.map(({ session, at }) => {
    const invoice = invoices.get(session.id);
    const spot = at ? spotName(tags, at, { ...partsOf(session), place: places.get(placeKey(at)) }) : null;
    const name = spot?.name ?? chargeName(partsOf(session));
    return { session, cost: teslaBill.get(session.id) ?? invoice?.amount ?? null, name: name?.text ?? null, spot };
  });
  const spots = charges.flatMap((c) => (c.spot ? [{ ...c, spot: c.spot }] : []));
  const chargePins = spots.map(({ session: s, spot }): MapPin => {
    const shown = spot.name?.text ?? undefined;
    return {
      lat: spot.target.lat,
      lng: spot.target.lng,
      t: Date.parse(s.started_at),
      kind: "charge",
      name: shown,
      label: shown ?? chargeType(s),
      note: [s.ended_at ? `${formatClock(s.started_at)} to ${formatClock(s.ended_at)}` : `From ${formatClock(s.started_at)}`, s.energy_added_kwh !== null ? `${formatKwh(s.energy_added_kwh)} added` : null]
        .filter(Boolean)
        .join(" · "),
    };
  });
  return {
    day,
    strip,
    trips,
    charges,
    spent: billsIn(chargingBills(tesla, streamOnly.filter(inDay), invoices), { from: start, to: end }).cost,
    route: routes.flatMap((r) => r.route),
    pins: [...routes.flatMap((r) => r.pins), ...chargePins],
    prev: day - 1 >= first ? day - 1 : null,
    next: day + 1 <= today ? day + 1 : null,
  };
}
