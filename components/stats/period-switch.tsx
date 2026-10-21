"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Period, PERIODS } from "./periods";

// The choice lives in the URL so a period can be shared; the server page reads it.
export function PeriodSwitch({ period }: { period: Period }) {
  const router = useRouter();
  return (
    <div role="group" aria-label="Period" className="inline-flex border">
      {PERIODS.map(({ value, label }) => (
        <Button
          key={value}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={period === value}
          onClick={() => router.replace(value === "month" ? "/stats" : `/stats?period=${value}`, { scroll: false })}
          className={cn("rounded-none", period === value && "bg-secondary text-foreground")}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
