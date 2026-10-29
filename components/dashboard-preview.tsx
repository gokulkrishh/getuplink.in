"use client";

import { Bell } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

// Server-rendered as before, but its code is a chunk of its own, off the home page's first load.
const PreviewChart = dynamic(() => import("@/components/home/preview-chart"));

// Static illustration of the dashboard for the home page hero; reads no data. Only the chart is interactive.
export function DashboardPreview() {
  // The wrapper is hidden from assistive tech, so nothing inside it may take focus. The chart (recharts)
  // makes its SVG tabbable; take it back out of the tab order, including after it redraws.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const untab = () => el.querySelectorAll("[tabindex]:not([tabindex='-1'])").forEach((n) => n.setAttribute("tabindex", "-1"));
    untab();
    const observer = new MutationObserver(untab);
    observer.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["tabindex"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="relative w-full max-w-md text-left select-none">
      {/* The kind of moment Uplink is for: an update reaching the car. */}
      <div className="mb-4 ml-auto flex w-fit max-w-xs items-start gap-3 border px-4 py-3 text-sm shadow-xs">
        <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>
          <span className="font-medium">Update available</span>
          <span className="block text-muted-foreground">2026.38.5.1 is ready for your Model Y.</span>
        </p>
      </div>
      <div className="border bg-background p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between text-xs text-faint">
          <span>Model Y · Diamond Black</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-positive" />
            Online
          </span>
        </div>
        <p className="mt-2 font-mono text-4xl font-medium tracking-tight tabular-nums">2026.38.3.1</p>
        <div className="mt-8 flex items-baseline justify-between text-sm">
          <span>
            Downloading <span className="ml-1 font-mono text-muted-foreground">2026.38.5.1</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">42%</span>
        </div>
        {/* Same bar as the dashboard's update progress, shimmer included. */}
        <div className="mt-2 h-1 overflow-hidden bg-border">
          <div className="relative h-full overflow-hidden bg-foreground" style={{ width: "42%" }}>
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
          </div>
        </div>
        <div className="mt-8">
          <PreviewChart />
        </div>
      </div>
    </div>
  );
}
