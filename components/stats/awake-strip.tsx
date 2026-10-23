"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Presence, type Run, runLabel } from "@/lib/awake";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

// One day's strip. Hovering, focusing or tapping a run shows its state, time and length above it, in
// the chart tooltips' style; Escape or a tap elsewhere hides it. The tip is clamped inside the strip.
export function AwakeStrip({ start, runs, classes }: { start: number; runs: Run[]; classes: Record<Presence, string> }) {
  const [active, setActive] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const run = active === null ? null : runs[active];

  useLayoutEffect(() => {
    if (!run || !strip.current || !tip.current) return;
    const width = strip.current.offsetWidth;
    const own = tip.current.offsetWidth;
    const center = (((run.start + run.end) / 2 - start) / DAY) * width;
    setLeft(Math.max(0, Math.min(width - own, center - own / 2)));
  }, [run, start]);

  useEffect(() => {
    if (active === null) return;
    const away = (e: PointerEvent) => {
      if (!strip.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active]);

  return (
    <div ref={strip} className="relative h-2.5 flex-1" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      {runs.map((r, k) => (
        <button
          type="button"
          key={r.start}
          aria-label={runLabel(r)}
          className={cn(
            "absolute inset-y-0 outline-offset-1 after:absolute after:inset-x-0 after:-inset-y-1 focus-visible:outline-2 focus-visible:outline-ring max-sm:after:-inset-y-2",
            classes[r.state],
          )}
          style={{ left: `${((r.start - start) / DAY) * 100}%`, width: `${((r.end - r.start) / DAY) * 100}%` }}
          onPointerEnter={(e) => e.pointerType === "mouse" && setActive(k)}
          onClick={() => setActive(k)}
          onFocus={() => setActive(k)}
          onBlur={() => setActive((a) => (a === k ? null : a))}
          onKeyDown={(e) => e.key === "Escape" && setActive(null)}
        />
      ))}
      {run && (
        <span
          ref={tip}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 border bg-background px-2 py-1 font-mono text-xs whitespace-nowrap tabular-nums"
          style={{ left }}
        >
          {runLabel(run)}
        </span>
      )}
    </div>
  );
}
