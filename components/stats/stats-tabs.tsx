"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PeriodSwitch } from "./period-switch";
import { type Period, statsHref, type View, VIEWS } from "./periods";

// All four tabs arrive in the first response, so switching is instant: only the address bar changes,
// and a shared link still opens the same tab. The period still reloads from the server.
export function StatsTabs({ initial, period, panels }: { initial: View; period: Period; panels: Record<View, ReactNode> }) {
  const [view, setView] = useState(initial);
  const select = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", statsHref(next, period));
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
                select(value);
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
        {view !== "battery" && <PeriodSwitch period={period} view={view} />}
      </div>
      {panels[view]}
    </div>
  );
}
