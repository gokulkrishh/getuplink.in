"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PeriodContext } from "./period-scope";
import { PeriodSwitch } from "./period-switch";
import { type Period, statsHref, type View, VIEWS } from "./periods";

// All four tabs, in every period, arrive in the first response, so switching either is instant: only
// the address bar changes, and a shared link still opens the same tab and period.
export function StatsTabs({ initial, initialPeriod, panels }: { initial: View; initialPeriod: Period; panels: Record<View, ReactNode> }) {
  const [view, setView] = useState(initial);
  const [period, setPeriod] = useState(initialPeriod);
  const select = (nextView: View, nextPeriod: Period) => {
    setView(nextView);
    setPeriod(nextPeriod);
    window.history.replaceState(null, "", statsHref(nextView, nextPeriod));
  };
  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <nav aria-label="Stats sections" className="flex gap-6 border-b text-sm">
          {VIEWS.map(({ value, label }) => (
            <a
              key={value}
              href={statsHref(value, period)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                select(value, period);
              }}
              aria-current={view === value ? "page" : undefined}
              className={cn(
                "-mb-px border-b py-2 transition-colors duration-150",
                view === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </a>
          ))}
        </nav>
        {/* The battery trend covers its own window, so the period doesn't apply there. */}
        {view !== "battery" && <PeriodSwitch period={period} onChange={(next) => select(view, next)} />}
      </div>
      <PeriodContext value={{ period, select: (next) => select(view, next) }}>{panels[view]}</PeriodContext>
    </div>
  );
}
