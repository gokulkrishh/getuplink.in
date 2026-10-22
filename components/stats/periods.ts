import type { Period } from "@/lib/periods";

export type { Period };

// The period switch. Week is a Period but not offered yet.
export const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "6m", label: "6 months" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export function parsePeriod(value: string | string[] | undefined): Period {
  return PERIODS.find((p) => p.value === value)?.value ?? "month";
}

export type View = "charging" | "driving" | "battery" | "updates";

export const VIEWS: { value: View; label: string }[] = [
  { value: "charging", label: "Charging" },
  { value: "driving", label: "Driving" },
  { value: "battery", label: "Battery" },
  { value: "updates", label: "Updates" },
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
