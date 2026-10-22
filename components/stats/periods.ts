import type { Period } from "@/lib/periods";

export type { Period };

// The period switch. Week is a Period but not offered yet.
export const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "6m", label: "6 months" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

// Updates come too seldom for a week (or six months) to say anything.
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

// The Stats URL for a tab and period; the defaults stay out of it.
export function statsHref(view: View, period: Period): string {
  const params = new URLSearchParams();
  if (view !== "charging") params.set("view", view);
  if (period !== "month") params.set("period", period);
  const query = params.toString();
  return query ? `/stats?${query}` : "/stats";
}
