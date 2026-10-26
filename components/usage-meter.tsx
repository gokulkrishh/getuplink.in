"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MeterPart = { label: string; value: string; share: number };

// The month's estimated cost as a bar the width of the row, filled to the share of the credit used, one
// segment per Tesla category with a cost. Hovering, focusing or tapping a segment shows its category and
// cost above it, in the chart tooltips' style; Escape or a tap elsewhere hides it. Segments share the one
// chart hue, stepped in strength, with a hairline between them.
export function UsageMeter({ parts, label }: { parts: MeterPart[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const shown = parts.filter((p) => p.share > 0);
  // Over the credit, the bar is full and each part keeps its share of the whole.
  const total = shown.reduce((sum, p) => sum + p.share, 0);
  const scale = total > 1 ? 1 / total : 1;
  let left = 0;

  return (
    <div ref={box} role="group" aria-label={label} className="relative flex h-2.5 w-full gap-px bg-muted">
      {shown.map((p, i) => {
        const width = p.share * scale * 100;
        const at = left + width / 2;
        left += width;
        const side = at < 25 ? "left-0" : at > 75 ? "right-0" : "left-1/2 -translate-x-1/2";
        return (
          <button
            key={p.label}
            type="button"
            aria-label={`${p.label}, ${p.value}`}
            className="chart-touch relative h-full outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-2 focus-visible:outline-2 focus-visible:outline-ring"
            style={{ width: `${width}%` }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(i)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(null)}
            onClick={() => setOpen(i)}
            onFocus={() => setOpen(i)}
            onBlur={() => setOpen(null)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
          >
            <span className={cn("block h-full bg-chart-accent", STRENGTH[i % STRENGTH.length])} />
            {open === i && (
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-2 border bg-background px-2 py-1 text-left text-xs whitespace-nowrap tabular-nums shadow-sm",
                  side,
                )}
              >
                <span className="block text-muted-foreground">{p.label}</span>
                <span className="block font-mono">{p.value}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const STRENGTH = ["opacity-100", "opacity-70", "opacity-50", "opacity-35"];
