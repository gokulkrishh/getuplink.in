import { type DayRange, dayIso, daysLabel, isoDay, type Period } from "@/lib/periods";
import { istDay } from "@/lib/telemetry-derive";

export type { Period };

// The period switch.
export const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

// Every page with the switch also offers a range picked by date.
export type HomePeriod = Period | "custom";
export const HOME_PERIODS: { value: HomePeriod; label: string }[] = [...PERIODS, { value: "custom", label: "Custom" }];

// What a page's switch offers and the period the page opens on. The one it opens on stays out of its URL
// (see periodQuery and PeriodScope), so each page declares it here once and every link and parser agrees.
export type PeriodSet = { options: Period[]; opensOn: Period };

const ALL_PERIODS = PERIODS.map(({ value }) => value);

export const PAGE_PERIODS = {
  // Home is a glance at the last 7 days, with no switch: other periods are picked on Stats. Every Stats page
  // (Driving, Charging, Battery) opens on the week too, one default for all (the owner's call, 1 Nov 2026):
  // a week of bars says more than today's hours, and the same period everywhere is easier to follow.
  home: { options: ["week"], opensOn: "week" },
  stats: { options: ALL_PERIODS, opensOn: "week" },
  // Updates come too seldom for a day or a week to say anything.
  updates: { options: ["month", "year", "all"], opensOn: "month" },
} satisfies Record<string, PeriodSet>;

// The period a page opens on.
export const defaultPeriod = (page: PeriodSet): Period => page.opensOn;

// The period in a URL, if the page offers it; otherwise the one the page opens on.
export function parsePeriod(value: string | string[] | undefined, page: PeriodSet): Period {
  return page.options.find((p) => p === value) ?? defaultPeriod(page);
}

export type View = "charging" | "driving" | "battery";

// A Stats page's set: its own entry in PAGE_PERIODS where it has one, otherwise Stats'.
export function viewPeriods(view: View): PeriodSet {
  return (PAGE_PERIODS as Record<string, PeriodSet>)[view] ?? PAGE_PERIODS.stats;
}

export const VIEWS: { value: View; label: string }[] = [
  { value: "driving", label: "Driving" },
  { value: "charging", label: "Charging" },
  { value: "battery", label: "Battery" },
];

// A range picked by date, as the URL and a date input hold it: "2026-10-25", both days included.
export type DateRange = { from: string; to: string };
// Custom on a scope: the range whose panels came with the page (null when none did) and today, as the
// server saw it, for the picker's latest day.
export type CustomScope = { range: DateRange | null; today: string };

// What a page's PeriodScope needs for Custom, from the range the server drew (null when it drew none).
export function customScope(range: DayRange | null, now: number): CustomScope {
  return { range: range && { from: dayIso(range.from), to: dayIso(range.to) }, today: dayIso(istDay(now)) };
}

// A URL's from and to when both are dates; otherwise null.
export function urlRange(from: string | null | undefined, to: string | null | undefined): DateRange | null {
  return from && to && isoDay(from) !== null && isoDay(to) !== null ? { from, to } : null;
}

// Whether a Custom URL carries dates that can't be read: a from or to is there, but not both as dates. No
// dates at all is fine, it opens on the last 30 days.
export function unreadableDates(from: string | null | undefined, to: string | null | undefined): boolean {
  return Boolean(from || to) && urlRange(from, to) === null;
}

// A drawn range in words, as charts name it: "1 Oct to 20 Oct", with the year when it isn't this one.
function shownWords(shown: DateRange, today: string): string {
  return daysLabel(isoDay(shown.from)!, isoDay(shown.to)!, isoDay(today)! * 86_400_000);
}

// The line under the switch when a Custom link's dates aren't the ones shown, or null. Dates that can't be
// read open on the last 30 days; dates in the future, before 2012 or the wrong way round are moved, so the
// line names the range the figures below are for.
export function datesNote(
  period: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
  shown: DateRange | null,
  today: string,
): string | null {
  if (period !== "custom") return null;
  if (unreadableDates(from, to)) return "Uplink couldn't read those dates, so it shows the last 30 days.";
  if (!from || !to || !shown || (shown.from === from && shown.to === to)) return null;
  return `Uplink couldn't use those dates, so it shows ${shownWords(shown, today)}.`;
}

// The picker's line for dates it can't pick: what to fix, and that the figures are still for the range shown.
export function pickerLine(problem: string, shown: DateRange, today: string): string {
  return `${problem} The page still shows ${shownWords(shown, today)}.`;
}

// A page's query for a period: none for the one the page opens on, and for Custom its dates, or none, which
// opens on the last 30 days.
export function periodQuery(period: HomePeriod, range: DateRange | null, page: PeriodSet): string {
  if (period === "custom") return range ? `?period=custom&from=${range.from}&to=${range.to}` : "?period=custom";
  return period === defaultPeriod(page) ? "" : `?period=${period}`;
}

// A Stats page's URL with a period, and for Custom its dates; the period that page opens on stays out of it
// (Week, on every Stats page). A link from Home carries Home's period over: Week on Home arrives as the page's own Week.
export function statsHref(view: View, period: HomePeriod, range: DateRange | null = null): string {
  return `/stats/${view}${periodQuery(period, range, viewPeriods(view))}`;
}
