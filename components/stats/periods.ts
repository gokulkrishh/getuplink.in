import type { Period } from "@/lib/periods";

export type { Period };

// The period switch.
export const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

// Updates come too seldom for a week to say anything.
export const UPDATE_PERIODS: Period[] = ["month", "year", "all"];

// The period a page opens on: Week wherever the switch offers it, else the first option (Month on Updates).
export function defaultPeriod(allowed?: Period[]): Period {
  return !allowed || allowed.includes("week") ? "week" : allowed[0];
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

// A Stats page's URL with a period; the default stays out of it.
export function statsHref(view: View, period: Period): string {
  return period === defaultPeriod() ? `/stats/${view}` : `/stats/${view}?period=${period}`;
}
