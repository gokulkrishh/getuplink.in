"use client";

import { useSearchParams } from "next/navigation";
import { TabLinks } from "@/components/segmented";
import { statsHref, urlRange, type View, viewPeriods, VIEWS } from "./periods";

// One page per topic, with the period carried over (Custom with its dates): the one picked on this page,
// read from the URL the period switch keeps. With none in the URL (or one it can't read) nothing was picked, so each topic opens on
// its own (Week on Driving, Month on Charging, All on Battery). Drawn in the page's shell, outside the data's Suspense, so the
// tabs stay put while a topic's data loads; `ViewTabsShell` is the same tabs before the URL is read.
export function ViewTabs({ view }: { view: View }) {
  const params = useSearchParams();
  const raw = params.get("period");
  const range = raw === "custom" ? urlRange(params.get("from"), params.get("to")) : null;
  const period = range ? "custom" : (viewPeriods(view).options.find((p) => p === raw) ?? null);
  return (
    <TabLinks
      name="stats-view-indicator"
      label="Stats sections"
      options={VIEWS.map(({ value, label }) => ({ value, label, href: statsHref(value, period ?? viewPeriods(value).opensOn, range) }))}
      value={view}
    />
  );
}

export function ViewTabsShell({ view }: { view: View }) {
  return (
    <TabLinks
      name="stats-view-indicator"
      label="Stats sections"
      options={VIEWS.map(({ value, label }) => ({ value, label, href: statsHref(value, viewPeriods(value).opensOn, null) }))}
      value={view}
    />
  );
}
