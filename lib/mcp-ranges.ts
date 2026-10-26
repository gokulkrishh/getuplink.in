// Dates and spans the MCP connector's tools read from an AI, kept pure so they can be tested on their own.
import { DRIVE_DAYS } from "@/lib/drives";
import { dayIso, isoDay } from "@/lib/periods";
import { type SeasonFigure, seasonMonths } from "@/lib/seasons";
import { istDay, istDayStart } from "@/lib/telemetry-derive";

const DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// A time from the AI: with an offset or Z as given, without one as IST wall-clock time. A date alone
// ("2026-10-21") is that day's IST midnight: "2026-10-21+05:30" isn't a valid time, so it gets "T00:00".
export function parseInvoiceTime(value: string): number {
  const local = DATE_ONLY.test(value) ? `${value}T00:00` : value;
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(local) ? local : `${local}+05:30`);
}

// The end of a range from the AI. A date alone takes in that whole IST day, so it ends at the next
// midnight; a time ends at that time, with no day added.
export function parseRangeEnd(value: string): number {
  const at = parseInvoiceTime(value);
  return DATE_ONLY.test(value) ? at + DAY : at;
}

// The IST day a get_day date names, kept to the days the Day page offers (see loadDay): today and the
// DRIVE_DAYS before it. An error when the date isn't a real one or falls outside them, so a future date
// never comes back with today's timeline.
export function dayBounds(date: string, now: number): { day: number; start: number; end: number; days: number } | { error: string } {
  const day = isoDay(date);
  if (day === null) return { error: "date must be a real date like 2026-10-23" };
  const today = istDay(now);
  const first = istDay(now - DRIVE_DAYS * DAY) + 1;
  if (day > today || day < first) return { error: `date must be between ${dayIso(first)} and ${dayIso(today)}` };
  return { day, start: istDayStart(day), end: istDayStart(day + 1), days: today - day + 1 };
}

// The span the season figures cover, oldest month to newest: "Dec 2025 to Oct 2026 so far". Null with none.
export function seasonsPeriod(seasons: SeasonFigure[]): string | null {
  if (seasons.length === 0) return null;
  const first = Math.min(...seasons.map((s) => s.first));
  const last = Math.max(...seasons.map((s) => s.last));
  return seasonMonths({ ...seasons[0], first, last, current: seasons.some((s) => s.current) });
}
