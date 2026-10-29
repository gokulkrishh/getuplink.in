"use client";

import { useSearchParams } from "next/navigation";
import { unreadableDates } from "./periods";

// A Custom link whose dates can't be read opens on the last 30 days; this says so, so the dates shown are not
// taken for the ones in the link.
export function DatesNote() {
  const params = useSearchParams();
  if (params.get("period") !== "custom" || !unreadableDates(params.get("from"), params.get("to"))) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Uplink couldn&apos;t read those dates, so it shows the last 30 days.
    </p>
  );
}
