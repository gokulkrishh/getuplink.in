import { type DayRange, dayIso, isoDay, type Period } from "@/lib/periods";
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
  // Home is a glance at the last 7 days, with no switch: other periods are picked on Stats. Stats opens on
  // the week too: a week of bars says more than today's hours.
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

// A page's query for a period: none for the one the page opens on, and for Custom its dates, or none, which
// opens on the last 30 days.
export function periodQuery(period: HomePeriod, range: DateRange | null, page: PeriodSet): string {
  if (period === "custom") return range ? `?period=custom&from=${range.from}&to=${range.to}` : "?period=custom";
  return period === defaultPeriod(page) ? "" : `?period=${period}`;
}

// A Stats page's URL with a period, and for Custom its dates; Week, which Stats opens on, stays out of it.
// A link from Home carries Home's period over, so Day on Home arrives as ?period=day.
export function statsHref(view: View, period: HomePeriod, range: DateRange | null = null): string {
  return `/stats/${view}${periodQuery(period, range, PAGE_PERIODS.stats)}`;
}
