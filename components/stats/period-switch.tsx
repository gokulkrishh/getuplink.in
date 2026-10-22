"use client";

import { Segmented } from "@/components/segmented";
import { type Period, PERIODS } from "./periods";

// Picks the period in the browser; its scope keeps it in the URL so a period can be shared. `options`
// limits the choice (all of PERIODS by default).
export function PeriodSwitch({ period, options, onChange }: { period: Period; options?: Period[]; onChange: (period: Period) => void }) {
  return (
    <Segmented
      label="Period"
      options={PERIODS.filter(({ value }) => !options || options.includes(value))}
      value={period}
      onChange={onChange}
    />
  );
}
