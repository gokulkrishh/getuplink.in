"use client";

import { useEffect, useRef, useState } from "react";
import { hasSparkData, SLOT_WIDTH, sparkBars, sparkLine } from "@/lib/sparkline";
import { cn } from "@/lib/utils";
import { Measure } from "@/components/measure";

const SPARK_HEIGHT = 24;

// One value per slot, null where there's nothing to draw. `current` is the slot holding now. `tips` names
// each slot and its value for the tooltip ("23 Oct", "46 km"), null for a slot with nothing known.
export type Spark = { kind: "bars" | "line"; values: (number | null)[]; current: number; tips: ({ title: string; value: string } | null)[] };

// The period's shape behind a headline number: bars for totals, a line for a rate. With nothing to draw
// it says so in the same height, not a bare baseline. Hover a slot, or tap it on a touch screen, for its
// label and value; the tile is a link, so a tap on the sparkline opens the tip instead of following it, and
// a tap anywhere else closes it. Screen readers get the tile's number and sentence instead.
export function Sparkline({ kind, values, current, tips }: Spark) {
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef(false);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (active === null) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active]);

  if (!hasSparkData(kind, values)) {
    return <p className="flex h-6 items-center text-xs text-faint">No data yet</p>;
  }
  const width = values.length * SLOT_WIDTH;
  const slotAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const k = Math.floor(((clientX - rect.left) / rect.width) * values.length);
    return Math.max(0, Math.min(values.length - 1, k));
  };
  const tip = active === null ? null : tips[active];

  return (
    <div
      ref={box}
      className="relative"
      onPointerDown={(e) => (touch.current = e.pointerType !== "mouse")}
      onPointerMove={(e) => e.pointerType === "mouse" && setActive(slotAt(e.clientX))}
      onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
      onClick={(e) => {
        if (!touch.current) return;
        e.preventDefault();
        e.stopPropagation();
        const k = slotAt(e.clientX);
        setActive((prev) => (prev === k ? null : k));
      }}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${SPARK_HEIGHT}`} preserveAspectRatio="none" className="block h-6 w-full overflow-visible">
        <line x1={0} x2={width} y1={SPARK_HEIGHT} y2={SPARK_HEIGHT} className="stroke-border" vectorEffect="non-scaling-stroke" />
        {kind === "bars" ? (
          sparkBars(values, SPARK_HEIGHT).map((bar) => (
            <rect
              key={bar.k}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              className={cn(
                "transition-colors duration-150",
                bar.k === current ? "fill-chart-accent" : bar.k === active ? "fill-chart-accent/80" : "fill-chart-accent/40 group-hover:fill-chart-accent/60",
              )}
            />
          ))
        ) : (
          <path
            d={sparkLine(values, SPARK_HEIGHT)}
            fill="none"
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-muted-foreground"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {active !== null && tip && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full z-10 mb-1 border bg-background px-2 py-1 text-xs whitespace-nowrap"
          style={{
            left: `${((active + 0.5) / values.length) * 100}%`,
            transform: `translateX(${active < values.length / 3 ? "-10%" : active > (values.length * 2) / 3 ? "-90%" : "-50%"})`,
          }}
        >
          <span className="text-muted-foreground">{tip.title}</span> <span className="font-mono tabular-nums">
            <Measure text={tip.value} />
          </span>
        </span>
      )}
    </div>
  );
}
