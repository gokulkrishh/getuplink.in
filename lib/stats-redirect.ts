import { parsePeriod, statsHref, UPDATE_PERIODS, type View, VIEWS } from "@/components/stats/periods";

// Where an old /stats link goes: each tab is its own page now (Driving, the first, when none is named), and update
// stats moved to /updates. The period carries over where the new page offers it; each page's default
// stays out of the URL.
export function statsRedirect(params: URLSearchParams): string {
  const view = params.get("view");
  const period = params.get("period") ?? undefined;
  if (view === "updates") {
    const kept = parsePeriod(period, UPDATE_PERIODS);
    return kept === "month" ? "/updates" : `/updates?period=${kept}`;
  }
  const page = VIEWS.find((v) => v.value === view)?.value ?? ("driving" satisfies View);
  return statsHref(page, parsePeriod(period));
}
