"use client";

import { TabLinks } from "@/components/segmented";
import { usePeriod } from "./period-scope";
import { statsHref, type View, VIEWS } from "./periods";

// One page per topic, with the period carried over: the one picked on this page, not the one it opened with.
export function ViewTabs({ view }: { view: View }) {
  const period = usePeriod();
  return (
    <TabLinks
      name="stats-view-indicator"
      label="Stats sections"
      options={VIEWS.map(({ value, label }) => ({ value, label, href: statsHref(value, period) }))}
      value={view}
    />
  );
}
