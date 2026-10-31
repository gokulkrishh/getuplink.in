"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Same box as the loaded chart (panel + h-20), so nothing shifts when recharts arrives after hydration.
function Placeholder() {
  return (
    <div className="rounded-lg bg-muted dark:bg-card px-3 pt-4 pb-2">
      <div className="h-20 w-full">
        <Skeleton className="h-full w-full bg-background/60" aria-busy="true" aria-label="Loading chart" />
      </div>
    </div>
  );
}

// recharts loads lazily, client-only.
const Plot = dynamic(() => import("./version-chart-plot"), { ssr: false, loading: Placeholder });

// A quiet step line: each rise is a new version, the last segment runs to the latest check. Just the plot:
// the page wraps it in a ChartCard for its title, description and caption.
export function VersionChart({
  changes,
  until,
}: {
  changes: { version: string; detected_at: string }[];
  until: string | null;
}) {
  if (changes.length === 0) return null;
  return <Plot changes={changes} until={until} />;
}
