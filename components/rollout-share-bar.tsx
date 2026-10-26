"use client";

import { useEffect, useRef, useState } from "react";
import { formatPercent } from "@/lib/format";

// One version's share of the counted cars, as a bar the width of the row. Hovering, focusing or tapping
// it shows the share and the count above it, in the chart tooltips' style; Escape or a tap elsewhere
// hides it. The bar carries the one chart hue: the share of cars is the screen's data.
export function ShareBar({ on, of }: { on: number; of: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const pct = formatPercent(of ? (on / of) * 100 : 0);
  const words = `${pct} of cars, ${on} of ${of}`;

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
      aria-label={words}
      className="chart-touch relative block h-1.5 w-full bg-muted outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-ring"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
      onClick={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <span className="block h-full bg-chart-accent" style={{ width: `${of ? (on / of) * 100 : 0}%` }} />
      {open && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 border bg-background px-2 py-1 text-left text-xs whitespace-nowrap tabular-nums shadow-sm"
        >
          <span className="block font-mono">{pct} of cars</span>
          <span className="block text-muted-foreground">
            {on} of {of} cars
          </span>
        </span>
      )}
    </button>
  );
}
