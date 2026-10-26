import "server-only";
import type { Owner } from "./data/owner";
import type { MapPin, MapPoint } from "@/components/stats/trip-map";
import { type Day, dayStrips } from "@/lib/day-timeline";
import { matchSessions } from "@/lib/charge-sessions";
import { billsIn, chargingBills } from "@/lib/charging-figures";
import { DRIVE_DAYS } from "@/lib/drives";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { tripRoute } from "@/lib/trip-route";
import { groupTrips, type Trip } from "@/lib/trips";
import { loadPresence } from "./awake";
import { loadChargingSessions } from "./charging";
import { loadDrivingFigures, loadWindowStats } from "./driving";
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
  charges: { session: StreamChargeSession; cost: number | null }[];
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
  const invoices = await invoicesBySession(owner, dayCharges.filter((s) => !s.supercharger).map((s) => s.id));
  // Where the car went: each trip's route and its start, stops and end, from one read of the day.
  const located = vin ? ((await loadReadingsByField(owner, vin, ["Location"], new Date(start - 30 * 60_000).toISOString(), new Date(Math.min(end + 30 * 60_000, now)).toISOString()))?.Location ?? []) : [];
  const routes = [...trips].reverse().map((t) => tripRoute(t, located));
  return {
    day,
    strip,
    trips,
    charges: dayCharges.map((session) => ({ session, cost: teslaBill.get(session.id) ?? invoices.get(session.id)?.amount ?? null })),
    spent: billsIn(chargingBills(tesla, streamOnly.filter(inDay), invoices), { from: start, to: end }).cost,
    route: routes.flatMap((r) => r.route),
    pins: routes.flatMap((r) => r.pins),
    prev: day - 1 >= first ? day - 1 : null,
    next: day + 1 <= today ? day + 1 : null,
  };
}
