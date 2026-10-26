"use client";

import { useSearchParams } from "next/navigation";
import { TabLinks } from "@/components/segmented";
import { PAGE_PERIODS, parsePeriod, statsHref, urlRange, type View, VIEWS } from "./periods";

// One page per topic, with the period carried over (Custom with its dates): the one picked on this page,
// read from the URL the period switch keeps. Drawn in the page's shell, outside the data's Suspense, so the
// tabs stay put while a topic's data loads; `ViewTabsShell` is the same tabs before the URL is read.
export function ViewTabs({ view }: { view: View }) {
  const params = useSearchParams();
  const raw = params.get("period");
  const range = raw === "custom" ? urlRange(params.get("from"), params.get("to")) : null;
  const period = range ? "custom" : parsePeriod(raw ?? undefined, PAGE_PERIODS.stats);
  return (
    <TabLinks
      name="stats-view-indicator"
      label="Stats sections"
      options={VIEWS.map(({ value, label }) => ({ value, label, href: statsHref(value, period, range) }))}
      value={view}
    />
  );
}

export function ViewTabsShell({ view }: { view: View }) {
  return (
    <TabLinks
      name="stats-view-indicator"
      label="Stats sections"
      options={VIEWS.map(({ value, label }) => ({ value, label, href: statsHref(value, PAGE_PERIODS.stats.opensOn, null) }))}
      value={view}
    />
  );
}
