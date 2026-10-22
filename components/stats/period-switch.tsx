"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Period, PERIODS } from "./periods";

// Picks the period in the browser; StatsTabs keeps it in the URL so a period can be shared.
export function PeriodSwitch({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  return (
    <div role="group" aria-label="Period" className="inline-flex border">
      {PERIODS.map(({ value, label }) => (
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
