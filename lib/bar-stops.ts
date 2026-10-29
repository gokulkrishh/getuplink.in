// What a day's bar can lead to when the day held exactly one drive or one charge: that drive's or charge's
// own page. Pure, like the other helpers: the loaders' lists go in, stops come out (see barOpens).
import type { Drive } from "@/lib/drives";
import { DRIVE_DAYS } from "@/lib/drives";
import { formatKm, showsZero } from "@/lib/format";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

// One drive or charge: when it ran (a charge counts on the day it started, so its end is its start) and
// the page it has, null for a charge only Tesla billed, which has none.
export type Stop = { start: number; end: number; href: string | null };

// The stops a chart can name, and `from`: the earliest moment they are all known. A day that starts before it
// may hold more than the list shows, so it is never called single.
export type Stops = { items: Stop[]; from?: number };

const DAY_MS = 86_400_000;

// The drives that moved the car, each at its trip page. Drives are kept for DRIVE_DAYS.
export function driveStops(drives: Drive[], now: number): Stops {
  return {
    items: drives.filter((d) => !showsZero(formatKm(d.km))).map((d) => ({ start: d.start, end: d.end, href: `/stats/driving/${d.start}` })),
    from: now - DRIVE_DAYS * DAY_MS,
  };
}

// Every charge, each at its page where it has one: a charge the car reported (`stream`) does.
export function chargeStops(charges: { started_at: string; stream: { id: number } | null }[]): Stops {
  return {
    items: charges.map((c) => {
      const at = Date.parse(c.started_at);
      return { start: at, end: at, href: c.stream ? `/stats/charging/${c.stream.id}` : null };
    }),
  };
}

// The stops of one IST day (`day`: its number, see istDay), and whether the day is wholly covered.
export function stopsOnDay(stops: Stops, day: number): { items: Stop[]; known: boolean } {
  const from = istDayStart(day);
  const to = from + DAY_MS;
  return {
    items: stops.items.filter((s) => (s.end > s.start ? s.start < to && s.end > from : istDay(s.start) === day)),
    known: stops.from === undefined || from >= stops.from,
  };
}
