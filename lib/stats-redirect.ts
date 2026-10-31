import { type HomePeriod, PAGE_PERIODS, parsePeriod, periodQuery, statsHref, urlRange, type View, viewPeriods, VIEWS } from "@/components/stats/periods";

// Where an old /stats link goes: each tab is its own page now (Driving, the first, when none is named), and update
// stats moved to /updates. The period carries over where the new page offers it, Custom with its dates;
// the period each page opens on stays out of the URL (see PAGE_PERIODS).
export function statsRedirect(params: URLSearchParams): string {
  const view = params.get("view");
  const raw = params.get("period") ?? undefined;
  const range = urlRange(params.get("from"), params.get("to"));
  if (view === "updates") {
    const period: HomePeriod = raw === "custom" ? "custom" : parsePeriod(raw, PAGE_PERIODS.updates);
    return `/updates${periodQuery(period, range, PAGE_PERIODS.updates)}`;
  }
  const page = VIEWS.find((v) => v.value === view)?.value ?? ("driving" satisfies View);
  return statsHref(page, raw === "custom" ? "custom" : parsePeriod(raw, viewPeriods(page)), range);
}
