"use client";

import { useRef } from "react";
import { useAxisLabels, useBarTips } from "@/components/stats/axis-labels";
import { AxisLabel, BAR_MAX, BarTip, Column } from "@/components/stats/bar-parts";
import { ChartFrame } from "@/components/stats/bars";
import { TapColumns } from "@/components/stats/tap-columns";
import { cn } from "@/lib/utils";

// One column of the histogram: how many cars have a value in `span`. `axis` is the bin's start, written on
// its left edge like a histogram's ticks. `middle`: inside the middle half, drawn stronger. `you`: the
// owner's own car is in it.
export type SpreadBin = { key: string; span: string; axis: string; cars: number; middle: boolean; you: boolean };

// Cars per bin, the middle half stronger and the owner's bin marked "You" above it. Each column's tip names
// its span and its cars, on hover, focus or tap, as on the other bar charts. `unit` titles the x axis.
export function Spread({ bins, unit, label }: { bins: SpreadBin[]; unit?: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useAxisLabels(box);
  useBarTips(box);
  const most = Math.max(...bins.map((b) => b.cars));
  const max = Math.max(2, Math.ceil(most / 2) * 2);
  return (
    <ChartFrame max={max} unit="cars" xUnit={unit}>
      <div ref={box}>
        <TapColumns className="grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }} aria-label={label}>
          {bins.map((b, k) => {
            const cars = `${b.cars} ${b.cars === 1 ? "car" : "cars"}`;
            const lines = [cars, b.you && "Yours is here"];
            return b.cars === 0 ? (
              <li key={b.key} aria-hidden="true" className="relative flex flex-col items-center gap-2">
                <span className="h-4" />
                <div className="h-20" />
                <AxisLabel label={b.axis} edge first={k === 0} />
              </li>
            ) : (
              <li key={b.key} className="group relative">
                <BarTip title={b.span} lines={lines} />
                <Column opens={null} words={[b.span, cars, b.you ? "yours is here" : ""].filter(Boolean).join(", ")}>
                  <span aria-hidden="true" className={cn("h-4 text-xs leading-4 font-medium whitespace-nowrap", b.you ? "text-chart-you" : "invisible")}>
                    You
                  </span>
                  <div className="flex h-20 w-full items-end justify-center">
                    <div
                      className={cn(
                        "w-full",
                        BAR_MAX,
                        b.you
                          ? "bg-chart-you"
                          : b.middle
                            ? "bg-chart-accent/70 group-hover:bg-chart-accent group-focus-within:bg-chart-accent group-data-[tapped=true]:bg-chart-accent"
                            : "bg-chart-accent/30 group-hover:bg-chart-accent/60 group-focus-within:bg-chart-accent/60 group-data-[tapped=true]:bg-chart-accent/60",
                      )}
                      style={{ height: `${Math.max(4, (b.cars / max) * 100)}%` }}
                    />
                  </div>
                  <AxisLabel label={b.axis} edge first={k === 0} />
                </Column>
              </li>
            );
          })}
        </TapColumns>
      </div>
    </ChartFrame>
  );
}
