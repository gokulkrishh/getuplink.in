import "server-only";
import type { Owner } from "./data/owner";
import { carNow, CAR_NOW_FIELDS } from "@/lib/car-now";
import { chargeEfficiency, matchSessions } from "@/lib/charge-sessions";
import { billedCharges } from "@/lib/charging-figures";
import { dayStrips } from "@/lib/day-timeline";
import { monthlyRows } from "@/lib/monthly";
import { DRIVE_DAYS } from "@/lib/drives";
import { dayBounds, seasonsPeriod } from "@/lib/mcp-ranges";
import { monthStart } from "@/lib/periods";
import { topStations } from "@/lib/top-stations";
import { groupTrips } from "@/lib/trips";
import { median, istDay, istDayStart } from "@/lib/telemetry-derive";
import { loadPresence } from "./awake";
import { loadBatteryExtras } from "./battery-extra";
import { loadCarFlags } from "./car-flags";
import { loadChargingSessions } from "./charging";
import { loadChargingExtras } from "./charging-extra";
import { loadDriveDetail } from "./drive-detail";
import { INSIGHT_DAYS, loadDrivingExtras } from "./driving-extra";
import { loadDrivingFigures, loadSeasonEfficiency, loadWindowStats } from "./driving";
import { seasonMonths, seasonName } from "@/lib/seasons";
import { invoicesBySession, istIso } from "./receipts";
import { loadStreamSessions } from "./stream-charging";
import { loadPrimaryVehicle, loadStream } from "./telemetry";
import { loadTyreArrivals } from "./telemetry-window";

// What the MCP connector's read tools return: the same loaders the pages use, shaped as plain JSON for an
// AI. Times are IST ("2026-10-23T10:54:00+05:30"), energy in kWh, distance in km, money in ₹. Nothing is
// estimated beyond what the pages show; where a figure isn't known it's null.

const DAY = 86_400_000;
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

async function car(owner: Owner) {
  const vehicle = await loadPrimaryVehicle(owner);
  return { vehicle, vin: vehicle?.vin ?? null };
}

// Trips (drives with stops under an hour between them) in a range, newest first, each with its legs.
export async function listTrips(owner: Owner, from: number, to: number) {
  const { vin } = await car(owner);
  const window = await loadWindowStats(owner, vin, Date.now());
  return groupTrips(window.driving.drives)
    .filter((t) => t.start >= from && t.start < to)
    .map((t) => ({
      trip_id: t.start,
      started_at: istIso(t.start),
      ended_at: istIso(t.end),
      km: r1(t.km),
      kwh_used: r1(t.kwh),
      battery_start_pct: r1(t.startLevel),
      battery_end_pct: r1(t.endLevel),
      stops: t.stops,
      legs: t.legs.map((d) => ({ drive_id: d.start, started_at: istIso(d.start), ended_at: istIso(d.end), km: r1(d.km), kwh_used: r1(d.kwh) })),
    }));
}

// One trip or drive in detail: totals, speeds, power, acceleration, grade, temperature and where it went.
export async function getTrip(owner: Owner, id: number, leg: boolean) {
  const d = await loadDriveDetail(owner, id, Date.now(), leg);
  if (!d) return { error: "No trip or drive starts at that time. Use list_trips for the ids." };
  const { trip } = d;
  const drivingMs = trip.legs.reduce((s, l) => s + (l.end - l.start), 0);
  const extreme = (points: { t: number; v: number }[], pick: (a: number, b: number) => boolean) =>
    points.length ? points.reduce((a, p) => (pick(p.v, a.v) ? p : a)) : null;
  const top = extreme(d.power, (a, b) => a > b);
  const regen = extreme(d.power, (a, b) => a < b);
  const accel = extreme(d.accel, (a, b) => a > b);
  const brake = extreme(d.accel, (a, b) => a < b);
  return {
    started_at: istIso(trip.start),
    ended_at: istIso(trip.end),
    km: r1(trip.km),
    driving_minutes: Math.round(drivingMs / 60_000),
    stopped_minutes: Math.round((trip.end - trip.start - drivingMs) / 60_000),
    kwh_used: r1(trip.kwh),
    battery_start_pct: r1(trip.startLevel),
    battery_end_pct: r1(trip.endLevel),
    range_used_km: r1(d.rangeUsedKm),
    average_speed_kmh: drivingMs ? Math.round(trip.km / (drivingMs / 3_600_000)) : null,
    top_speed_kmh: d.topKmh === null ? null : Math.round(d.topKmh),
    outside_c: r1(d.outsideC),
    most_power_kw: top && top.v > 0 ? { kw: Math.round(top.v), at: istIso(top.t) } : null,
    most_regen_kw: regen && regen.v < 0 ? { kw: Math.round(-regen.v), at: istIso(regen.t) } : null,
    strongest_acceleration_ms2: accel && accel.v > 0 ? { value: r1(accel.v), at: istIso(accel.t) } : null,
    hardest_braking_ms2: brake && brake.v < 0 ? { value: r1(-brake.v), at: istIso(brake.t) } : null,
    grade_pct: d.grade.length ? { min: r1(Math.min(...d.grade.map((p) => p.v))), max: r1(Math.max(...d.grade.map((p) => p.v))) } : null,
    legs: trip.legs.map((l, k) => ({
      started_at: istIso(l.start),
      ended_at: istIso(l.end),
      km: r1(l.km),
      kwh_used: r1(l.kwh),
      stop_before_minutes: k ? Math.round((l.start - trip.legs[k - 1].end) / 60_000) : null,
    })),
    places: d.pins.map((p) => ({ kind: p.kind, label: p.label, latitude: p.lat, longitude: p.lng })),
    route_points: d.route.length,
  };
}

// The battery now and over time: level, health against the best week, parked drain, temperatures and cells.
export async function batteryStatus(owner: Owner) {
  const now = Date.now();
  const { vin } = await car(owner);
  const [window, sessions] = await Promise.all([loadWindowStats(owner, vin, now), loadStreamSessions(owner)]);
  const extras = await loadBatteryExtras(owner, vin, window.trend, now);
  const best = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const latest = <T,>(xs: T[]) => xs.at(-1) ?? null;
  const finished = sessions.filter((s) => s.ended_at !== null);
  const { drain, parked, parkedNow } = window.driving;
  return {
    charge_level_pct: r1(latest(window.level?.points ?? [])?.level ?? null),
    usable_capacity_kwh: { now: r1(latest(window.trend)?.kwh ?? null), best_week: r1(best(window.trend.map((w) => w.kwh))) },
    full_pack_per_tesla_kwh: extras.teslaPack ? { value: r1(extras.teslaPack.kwh), reported_at: istIso(extras.teslaPack.at) } : null,
    range_at_100_km: { now: r1(latest(window.range)?.km ?? null), best_week: r1(best(window.range.map((w) => w.km))) },
    charging_efficiency: {
      ac: r1(((chargeEfficiency(finished.filter((s) => s.kind === "ac")) ?? NaN) * 100) || null),
      dc: r1(((chargeEfficiency(finished.filter((s) => s.kind === "dc")) ?? NaN) * 100) || null),
    },
    parked_now: parkedNow
      ? { since: istIso(parkedNow.start), hours: r1(parkedNow.hours), lost_pct: r1(parkedNow.lostPercent), lost_km: r1(parkedNow.lostKm), kwh: r1(parkedNow.kwh), average_kw: parkedNow.watts === null ? null : Math.round(parkedNow.watts) / 1000 }
      : null,
    parked_drain: drain
      ? { pct_per_day: r1(drain.percentPerDay), km_per_day: r1(drain.kmPerDay), average_kw: parked.some((p) => p.watts !== null) ? Math.round(median(parked.flatMap((p) => (p.watts === null ? [] : [p.watts])))) / 1000 : null, stretches: parked.length }
      : null,
    temperatures_c: { battery: r1(latest(extras.temps.battery)?.y ?? null), inside: r1(latest(extras.temps.inside)?.y ?? null), outside: r1(latest(extras.temps.outside)?.y ?? null) },
    cell_gap_mv: r1(latest(extras.cellSpreadMv)?.y ?? null),
  };
}

// Locked, Sentry, doors, windows, climate, temperatures and tyres, from the latest readings.
export async function carNowStatus(owner: Owner) {
  const { vehicle, vin } = await car(owner);
  if (!vehicle || !vin) return { error: "No car on this account." };
  const at = Date.now();
  const [stream, flags, arrivals] = await Promise.all([loadStream(owner, vin, CAR_NOW_FIELDS), loadCarFlags(owner, vehicle.id), loadTyreArrivals(owner, vin, at)]);
  const now = carNow(stream, at, flags.tyres, arrivals);
  return {
    last_update: now.since ? istIso(now.since) : null,
    state: Object.fromEntries(now.rows),
    // Pressures in psi. measured_at is when the car measured the tyre, null when it didn't say; updated_at is
    // when the reading arrived.
    tyres: Object.fromEntries(
      now.tyres.map((t) => [t.name, { pressure: t.pressure, measured_at: t.measuredAt ? istIso(t.measuredAt) : null, updated_at: istIso(t.updatedAt), warning: t.warning }]),
    ),
    tyre_warning: now.tyreWarning,
  };
}

// Charges and money: Tesla's and attached invoices, joined once.
async function charges(owner: Owner) {
  const now = Date.now();
  const [teslaSessions, streamSessions] = await Promise.all([loadChargingSessions(owner), loadStreamSessions(owner)]);
  const { streamOnly } = matchSessions(teslaSessions, streamSessions, now);
  const invoices = await invoicesBySession(owner, streamSessions.filter((s) => !s.supercharger).map((s) => s.id));
  return { now, teslaSessions, streamSessions, streamOnly, invoices };
}

// Month by month: driven, time driving, energy used, charges, energy added and spend (real bills only).
export async function monthlySummary(owner: Owner) {
  const { vin } = await car(owner);
  const { now, teslaSessions, streamOnly, invoices } = await charges(owner);
  const window = await loadWindowStats(owner, vin, now);
  const rows = monthlyRows(window.driving.drives, billedCharges(teslaSessions, streamOnly, invoices), now - DRIVE_DAYS * DAY, now);
  return {
    months: rows.map((r) => ({
      month: istIso(monthStart(r.month)).slice(0, 7),
      km: Math.round(r.km),
      driving_minutes: Math.round(r.drivingMs / 60_000),
      kwh_used: r1(r.kwhUsed),
      charges: r.charges,
      kwh_added: r1(r.kwhAdded),
      spend_inr: Math.round(r.spend),
      charges_without_bill: r.unbilled,
    })),
    note: "Driving covers the last 90 days of drives. Spend counts real bills only.",
  };
}

// Where you charge, typical start and end level, AC and DC time, and recent DC charges' power.
export async function chargingInsights(owner: Owner) {
  const { vin } = await car(owner);
  const { teslaSessions, streamSessions, streamOnly, invoices } = await charges(owner);
  const extras = await loadChargingExtras(owner, vin, streamSessions);
  const finished = streamSessions.filter((s) => s.ended_at !== null && s.start_level !== null && s.end_level !== null);
  const hours = (kind: "ac" | "dc") =>
    r1(streamSessions.filter((s) => s.kind === kind && s.ended_at).reduce((a, s) => a + Date.parse(s.ended_at!) - Date.parse(s.started_at), 0) / 3_600_000);
  return {
    top_stations: topStations([
      ...teslaSessions.map((s) => ({ name: s.site_name, kwh: s.energy_kwh, cost: s.cost_total })),
      ...streamOnly.filter((s) => s.ended_at !== null).map((s) => ({ name: s.station_name, kwh: s.energy_added_kwh, cost: invoices.get(s.id)?.amount ?? null })),
    ]).map((r) => ({ station: r.name, charges: r.charges, kwh: r1(r.kwh), spend_inr: r.billed ? Math.round(r.spend) : null })),
    typical_range_pct: finished.length ? { start: Math.round(median(finished.map((s) => s.start_level!))), end: Math.round(median(finished.map((s) => s.end_level!))) } : null,
    hours_charging: { ac: hours("ac"), dc: hours("dc") },
    recent_dc_charges: extras.curves.map((c) => ({
      date: istIso(c.date).slice(0, 10),
      charger: c.name,
      peak_kw: Math.round(Math.max(...c.points.map((p) => p.y))),
      average_kw: Math.round(c.points.reduce((a, p) => a + p.y, 0) / c.points.length),
      battery_from_pct: Math.round(Math.min(...c.points.map((p) => p.x))),
      battery_to_pct: Math.round(Math.max(...c.points.map((p) => p.x))),
    })),
  };
}

// Places the car parks and how driving goes: time at each speed and km per kWh by temperature and speed.
export async function drivingInsights(owner: Owner) {
  const now = Date.now();
  const { vin } = await car(owner);
  const window = await loadWindowStats(owner, vin, now);
  const [x, seasons] = await Promise.all([loadDrivingExtras(owner, vin, window.driving.drives, now), loadSeasonEfficiency(owner, vin, window.driving.drives, now)]);
  const TAG = { home: "Home", work: "Work", favorite: "Favourite" } as const;
  return {
    // The seasons reach back a year, further than the rest, so they carry their own span.
    period: `last ${INSIGHT_DAYS} days`,
    wh_per_km_by_season_period: seasonsPeriod(seasons.seasons),
    time_at_speed: x.speed.map((b) => ({ kmh: b.to === null ? `${b.from}+` : `${b.from}-${b.to}`, share_pct: Math.round(b.share * 100) })),
    km_per_kwh_by_outside_temp: x.byTemp.map((b) => ({ band: b.label, drives: b.drives, km: Math.round(b.km), km_per_kwh: r1(b.kmPerKwh) })),
    // The last four Indian seasons (IST months): Winter Dec-Feb, Summer Mar-May, Monsoon Jun-Sep, Post-monsoon Oct-Nov.
    wh_per_km_by_season: seasons.seasons.map((s) => ({ season: seasonName(s.season), months: seasonMonths(s), wh_per_km: Math.round(s.whPerKm), kwh: r1(s.kwh) })),
    wh_per_km_by_season_note:
      seasons.drivesFrom === null ? null : `Months before ${istIso(monthStart(seasons.drivesFrom)).slice(0, 7)} also count energy used while parked, so older seasons can read higher.`,
    km_per_kwh_by_speed: x.bySpeed.map((b) => ({ band: b.label, drives: b.drives, km: Math.round(b.km), km_per_kwh: r1(b.kmPerKwh) })),
    places: x.places.slice(0, 15).map((p) => ({
      name: p.tag ? TAG[p.tag] : p.name,
      visits: p.visits,
      hours_parked: r1(p.parkedMs / 3_600_000),
      last_visit: istIso(p.lastVisit),
      latitude: p.lat,
      longitude: p.lng,
    })),
  };
}

// One IST day: when the car drove, charged, parked or was seen asleep, its trips and its charges.
export async function daySummary(owner: Owner, date: string) {
  const now = Date.now();
  const bounds = dayBounds(date, now);
  if ("error" in bounds) return bounds;
  const { start, end, days } = bounds;
  const { vehicle, vin } = await car(owner);
  const [window, presence, figures, sessions] = await Promise.all([loadWindowStats(owner, vin, now), loadPresence(owner, vehicle, now), loadDrivingFigures(owner, vin, now), loadStreamSessions(owner)]);
  const day = dayStrips(
    days,
    {
      driving: window.driving.drives,
      charging: sessions.map((s) => ({ start: Date.parse(s.started_at), end: s.ended_at ? Date.parse(s.ended_at) : now })),
      asleep: presence.days.flatMap((d) => d.runs.filter((r) => r.state === "asleep")),
    },
    figures.since,
    now,
  )[0];
  const trips = await listTrips(owner, start, end);
  return {
    date,
    timeline: day.segments.map((s) => ({ kind: s.kind, from: istIso(s.start), to: istIso(s.end), minutes: Math.round((s.end - s.start) / 60_000) })),
    trips,
    charges: sessions
      .filter((s) => Date.parse(s.started_at) >= start && Date.parse(s.started_at) < end)
      .map((s) => ({ started_at: istIso(s.started_at), ended_at: s.ended_at ? istIso(s.ended_at) : null, type: s.supercharger ? "Supercharger" : s.kind.toUpperCase(), kwh_added: r1(s.energy_added_kwh), station: s.station_name })),
  };
}
