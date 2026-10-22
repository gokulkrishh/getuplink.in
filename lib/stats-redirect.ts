import type { Period } from "@/lib/periods";

const UPDATE_PERIODS: Period[] = ["month", "year", "all"];

// Where an old /stats link goes, keeping its period where the new page offers it. Update stats moved to
// /updates (Month, Year and All only). Null keeps the request on /stats.
export function statsRedirect(params: URLSearchParams): string | null {
  if (params.get("view") !== "updates") return null;
  const period = params.get("period") as Period | null;
  return period && period !== "month" && UPDATE_PERIODS.includes(period) ? `/updates?period=${period}` : "/updates";
}
