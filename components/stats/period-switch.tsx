"use client";

import { Segmented } from "@/components/segmented";
import { HOME_PERIODS, type HomePeriod, PERIODS } from "./periods";

// Picks the period in the browser; its scope keeps it in the URL so a period can be shared. `options`
// limits the choice (all of PERIODS by default); `custom` adds Custom, a range picked by date.
export function PeriodSwitch({
  period,
  options,
  custom = false,
  onChange,
}: {
  period: HomePeriod;
  options?: HomePeriod[];
  custom?: boolean;
  onChange: (period: HomePeriod) => void;
}) {
  return (
    <Segmented
      label="Period"
      options={(custom ? HOME_PERIODS : PERIODS).filter(({ value }) => !options || options.includes(value))}
      value={period}
      onChange={onChange}
    />
  );
}
