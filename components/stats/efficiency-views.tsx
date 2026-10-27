"use client";

import { useState } from "react";
import { Measure } from "@/components/measure";
import type { Band } from "@/lib/driving-insights";
import { DECIMALS, formatKm, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EfficiencyView = { key: string; label: string; bands: Band[] };

const FEW = 3;

// km per kWh one way of splitting the drives at a time (outside temperature, average speed, AC setting),
// picked with a switch. The ways don't share rows, so they can't be one table; one list at a time keeps the
// card short. Each row is the band, a bar for its km per kWh against the best, and the figure, with its
// drives and distance under the band. The best band is drawn in the accent colour and named in a line on top,
// so the answer reads before the bars. A band from fewer than FEW drives is faint: one drive says little.
export function EfficiencyViews({ views }: { views: EfficiencyView[] }) {
  const shown = views.filter((v) => v.bands.length > 0);
  const [key, setKey] = useState(shown[0]?.key);
  const view = shown.find((v) => v.key === key) ?? shown[0];
  if (!view) return null;
  const values = view.bands.map((b) => b.kmPerKwh ?? 0);
  const best = Math.max(...values);
  const top = view.bands[values.indexOf(best)];
  const few = view.bands.some((b) => b.drives < FEW);
  return (
    <div className="space-y-4">
      {shown.length > 1 && (
        <div role="tablist" aria-label="Split by" className="inline-flex border text-sm">
          {shown.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === view.key}
              onClick={() => setKey(v.key)}
              className={cn("px-3 py-1.5 transition-colors duration-150 max-sm:py-2", v.key === view.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {top && best > 0 && view.bands.length > 1 && (
        <p className="text-sm">
          Furthest {top.label === "AC off" ? "with AC off" : `at ${top.label}`}: {formatNumber(best, DECIMALS.kmPerKwh)} km per kWh.
        </p>
      )}
      <ul className="space-y-3 text-sm tabular-nums" aria-label={`km per kWh by ${view.label.toLowerCase()}`}>
        {view.bands.map((b, k) => (
          <li key={b.label} className={cn("grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3", b.drives < FEW && "opacity-60")}>
            <span className="min-w-0">
              <span className="block">{b.label}</span>
              <span className="block text-xs text-muted-foreground">
                {b.drives} {b.drives === 1 ? "drive" : "drives"} · <Measure text={formatKm(b.km)} />
              </span>
            </span>
            <span className="h-2 bg-muted" aria-hidden="true">
              <span className={cn("block h-full", values[k] === best && best > 0 ? "bg-chart-accent" : "bg-chart-accent/40")} style={{ width: `${best > 0 ? (values[k] / best) * 100 : 0}%` }} />
            </span>
            <span className={cn("text-right font-mono", b.kmPerKwh === null && "text-faint")}>{b.kmPerKwh !== null ? formatNumber(b.kmPerKwh, DECIMALS.kmPerKwh) : "—"}</span>
          </li>
        ))}
      </ul>
      {few && <p className="text-xs text-faint">Faint rows come from fewer than {FEW} drives, so they say less.</p>}
    </div>
  );
}
