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

// Updates come too seldom for a week to say anything.
export const UPDATE_PERIODS: Period[] = ["month", "year", "all"];

// The period a page opens on: Today wherever the switch offers it, else the first option (Month on Updates).
export function defaultPeriod(allowed?: Period[]): Period {
  return !allowed || allowed.includes("day") ? "day" : allowed[0];
}

// The period in a URL, if the page offers it (`allowed`, all of PERIODS by default); otherwise the default.
export function parsePeriod(value: string | string[] | undefined, allowed?: Period[]): Period {
  return PERIODS.find((p) => p.value === value && (!allowed || allowed.includes(p.value)))?.value ?? defaultPeriod(allowed);
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

// A page's query for a period: none for the page's default (`allowed` as in parsePeriod), and for Custom
// its dates, or none, which opens on the last 30 days.
export function periodQuery(period: HomePeriod, range: DateRange | null = null, allowed?: Period[]): string {
  if (period === "custom") return range ? `?period=custom&from=${range.from}&to=${range.to}` : "?period=custom";
  return period === defaultPeriod(allowed) ? "" : `?period=${period}`;
}

// A Stats page's URL with a period, and for Custom its dates; the default stays out of it.
export function statsHref(view: View, period: HomePeriod, range: DateRange | null = null): string {
  return `/stats/${view}${periodQuery(period, range)}`;
}
