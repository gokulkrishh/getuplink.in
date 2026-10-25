"use client";

import dynamic from "next/dynamic";

// Same box as the loaded chart (panel + h-20), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="bg-muted dark:bg-card px-3 pt-4 pb-2">
      <div className="h-20 w-full">
        <div className="h-full w-full bg-background/60 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./version-chart-plot"), { ssr: false, loading: Placeholder });

// A quiet step line: each rise is a new version, the last segment runs to the latest check.
export function VersionChart({
  changes,
  until,
}: {
  changes: { version: string; detected_at: string }[];
  until: string | null;
}) {
  if (changes.length === 0) return null;
  return (
    <figure className="space-y-2">
      <Plot changes={changes} until={until} />
      <figcaption className="text-xs text-muted-foreground">
        The car&apos;s software version over time, first to latest. Each step up is a new version arriving. Hover or tap for the version and date.
      </figcaption>
    </figure>
  );
}
