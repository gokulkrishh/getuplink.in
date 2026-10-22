"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Period, PERIODS } from "./periods";

// Picks the period in the browser; its scope keeps it in the URL so a period can be shared. `options`
// limits the choice (all of PERIODS by default).
export function PeriodSwitch({ period, options, onChange }: { period: Period; options?: Period[]; onChange: (period: Period) => void }) {
  return (
    <div role="group" aria-label="Period" className="inline-flex border">
      {PERIODS.filter(({ value }) => !options || options.includes(value)).map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={period === value}
          onClick={() => onChange(value)}
          className={cn("rounded-none", period === value && "bg-secondary text-foreground")}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
