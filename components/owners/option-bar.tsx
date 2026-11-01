"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// One option's share of owners, as a bar the width of the row (like the India rollout's ShareBar). Hovering,
// focusing or tapping it shows `lines` above it in the chart tooltips' style; Escape or a tap elsewhere
// hides it. `strong` is the owner's own option. `tick` marks the owner's own share (0 to 1) on a mix, where
// every owner has some of each option.
export function OptionBar({ share, lines, strong = false, tick = null }: { share: number; lines: string[]; strong?: boolean; tick?: number | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <button
      ref={box}
      type="button"
      aria-label={lines.join(", ")}
      className="chart-touch relative block h-1.5 w-full bg-muted outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-ring dark:bg-card"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      onClick={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <span className={cn("block h-full", strong ? "bg-chart-you" : "bg-chart-accent/50")} style={{ width: `${share * 100}%` }} />
      {tick !== null && (
        <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 bg-chart-you" style={{ left: `calc(${Math.min(1, tick) * 100}% - 1px)` }} />
      )}
      {open && (
        <span aria-hidden="true" className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 rounded-md border bg-background px-2 py-1 text-left text-xs whitespace-nowrap tabular-nums shadow-sm">
          {lines.map((line, k) => (
            <span key={line} className={cn("block", k === 0 ? "font-mono" : "text-muted-foreground")}>
              {line}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
