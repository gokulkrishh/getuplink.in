import type { Period } from "@/lib/periods";

export type { Period };

// The period switch.
export const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

// Updates come too seldom for a week to say anything.
export const UPDATE_PERIODS: Period[] = ["month", "year", "all"];

// The period in a URL, if the page offers it (`allowed`, all of PERIODS by default); otherwise Month.
export function parsePeriod(value: string | string[] | undefined, allowed?: Period[]): Period {
  return PERIODS.find((p) => p.value === value && (!allowed || allowed.includes(p.value)))?.value ?? "month";
}

export type View = "charging" | "driving" | "battery";

export const VIEWS: { value: View; label: string }[] = [
  { value: "charging", label: "Charging" },
  { value: "driving", label: "Driving" },
  { value: "battery", label: "Battery" },
];

export function parseView(value: string | string[] | undefined): View {
  return VIEWS.find((v) => v.value === value)?.value ?? "charging";
}

// A Stats page's URL with a period; Month, the default, stays out of it.
export function statsHref(view: View, period: Period): string {
  return period === "month" ? `/stats/${view}` : `/stats/${view}?period=${period}`;
}
