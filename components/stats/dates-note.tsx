"use client";

import { useSearchParams } from "next/navigation";
import { useShownRange } from "./period-scope";
import { datesNote } from "./periods";

// A Custom link whose dates aren't the ones shown says so and names what is: dates that can't be read open on
// the last 30 days, and the server moves dates in the future or the wrong way round. So the figures below are
// never taken for the dates in the link.
export function DatesNote() {
  const params = useSearchParams();
  const { range, today } = useShownRange();
  const note = today ? datesNote(params.get("period"), params.get("from"), params.get("to"), range, today) : null;
  if (!note) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {note}
    </p>
  );
}
