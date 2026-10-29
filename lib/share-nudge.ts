// The card on home that asks an owner who doesn't share whether they'd like to (components/home/share-nudge.tsx).
// Never turns sharing on: the card only asks, and Share goes through the same action as Settings.
//
// Two layers. The hard rules, which nothing overrides: not sharing, never turned sharing off, at least
// MIN_DATA_DAYS of data, an Owners page with enough cars to show anything, COOLDOWN_DAYS after each Not now,
// and never again after MAX_DISMISSALS. Within them, Jev decides once a day (lib/server/share-nudge.ts, after the owners run) from a
// few of the owner's figures whether comparing would interest them this week. A yes is stored as a window
// (show from, until) that lasts until the next night's decision; a no, or no answer, stores none.
// Pure, so it's tested directly (test/share-nudge.test.ts).
import { MIN_CARS, STATS_VERSION } from "@/lib/owners";
import { median } from "@/lib/telemetry-derive";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const MIN_DATA_DAYS = 7;
export const COOLDOWN_DAYS = 30;
export const MAX_DISMISSALS = 3;
// From this probability of "yes, it would interest them", Jev's answer opens a window.
export const SHOW_FROM_P = 0.6;
// A yes lasts until a little after the next night's decision, which replaces it.
export const SHOW_FOR_MS = 26 * HOUR;

// The latest published totals' header, as the Owners page checks it before it shows anything.
export type StatsHead = { v: number; cars: number; owners: number };

export type NudgeFacts = {
  // null before sharing exists (the migration not applied): no card.
  sharing: boolean | null;
  // When the owner's car first sent data, null when unknown.
  dataSince: number | null;
  stats: StatsHead | null;
  dismissals: number;
  dismissedAt: number | null;
  // When the owner last turned sharing off: they chose not to, so they're never asked again.
  stoppedAt: number | null;
  showFrom: number | null;
  showUntil: number | null;
};

export const ownersPageReady = (s: StatsHead | null) => s !== null && s.v === STATS_VERSION && s.cars >= MIN_CARS && s.owners >= MIN_CARS;

// The hard rules: whether this owner may be asked about at all. The nightly decision asks Jev only then.
// stoppedAt is kept from 20261114120000_share_nudge.sql on: an owner who stopped sharing before that has no
// record of it and can be asked again. Accepted by the owner of Uplink.
export function canAsk(f: NudgeFacts, now: number): boolean {
  if (f.sharing !== false || f.stoppedAt !== null) return false;
  if (f.dataSince === null || now - f.dataSince < MIN_DATA_DAYS * DAY) return false;
  if (!ownersPageReady(f.stats)) return false;
  if (f.dismissals >= MAX_DISMISSALS) return false;
  if (f.dismissedAt !== null && now - f.dismissedAt < COOLDOWN_DAYS * DAY) return false;
  return true;
}

// Whether home shows the card now: the hard rules again (a stored yes can't outlive them), then Jev's window,
// opened after the last Not now.
export function showNudge(f: NudgeFacts, now: number): boolean {
  if (!canAsk(f, now) || f.showFrom === null || f.showUntil === null) return false;
  if (now < f.showFrom || now >= f.showUntil) return false;
  return f.dismissedAt === null || f.showFrom > f.dismissedAt;
}

// Jev's probability to a window, or null for a no or no answer (fail closed).
export function verdictWindow(p: number | null, now: number): { from: number; until: number } | null {
  return p !== null && p >= SHOW_FROM_P ? { from: now, until: now + SHOW_FOR_MS } : null;
}

// ---- What Jev sees ----

export type Drive7 = { start: number; km: number; whPerKm: number | null };

// Numbers only, rounded: no place, time of day, car name or VIN. "Usual" is the four weeks before this one,
// over the part of them the car has data for.
export type NudgeFigures = {
  daysOfData: number;
  kmThisWeek: number;
  drivesThisWeek: number;
  usualKmPerWeek: number | null;
  whPerKmThisWeek: number | null;
  usualWhPerKm: number | null;
};

export const USUAL_WEEKS = 4;
const MIN_USUAL_DRIVES = 3;

// Energy use across drives, weighted by distance.
function whPerKm(drives: Drive7[]): number | null {
  const known = drives.filter((d) => d.whPerKm !== null && d.km > 0);
  const km = known.reduce((s, d) => s + d.km, 0);
  return km > 0 ? Math.round(known.reduce((s, d) => s + d.whPerKm! * d.km, 0) / km) : null;
}

export function nudgeFigures(drives: Drive7[], dataSince: number, now: number): NudgeFigures {
  const weekFrom = now - 7 * DAY;
  const usualFrom = Math.max(dataSince, weekFrom - USUAL_WEEKS * 7 * DAY);
  const week = drives.filter((d) => d.start >= weekFrom && d.start <= now);
  const before = drives.filter((d) => d.start >= usualFrom && d.start < weekFrom);
  const usualWeeks = (weekFrom - usualFrom) / (7 * DAY);
  const usualWh = before.filter((d) => d.whPerKm !== null).map((d) => d.whPerKm!);
  return {
    daysOfData: Math.floor((now - dataSince) / DAY),
    kmThisWeek: Math.round(week.reduce((s, d) => s + d.km, 0)),
    drivesThisWeek: week.length,
    usualKmPerWeek: usualWeeks >= 1 && before.length >= MIN_USUAL_DRIVES ? Math.round(before.reduce((s, d) => s + d.km, 0) / usualWeeks) : null,
    whPerKmThisWeek: whPerKm(week),
    usualWhPerKm: usualWh.length >= MIN_USUAL_DRIVES ? Math.round(median(usualWh)) : null,
  };
}
