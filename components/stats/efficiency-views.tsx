"use client";

import { useState } from "react";
import { Measure } from "@/components/measure";
import type { Band } from "@/lib/driving-insights";
import { DECIMALS, formatKm, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EfficiencyView = { key: string; label: string; bands: Band[] };

const FEW = 3;

// Wh per km, as everywhere else in the app, one way of splitting the drives at a time (average speed, AC
// setting, outside temperature), picked with a switch. The ways don't share rows, so they can't be one
// table; one list at a time keeps the card short. Each row is the band, a bar for its Wh/km against the
// highest, and the figure, with its drives and distance under the band. The lowest is drawn in the accent
// colour, and a line on top names the lowest and the highest, so the answer reads before the bars. A band
// from fewer than FEW drives is faint and left out of that line: one drive says little.
const whPerKm = (b: Band) => (b.kmPerKwh ? 1000 / b.kmPerKwh : null);
const wh = (n: number) => `${formatNumber(n, DECIMALS.whPerKm)} Wh/km`;
const at = (b: Band) => (b.label === "AC off" ? "With AC off" : `At ${b.label}`);

export function EfficiencyViews({ views }: { views: EfficiencyView[] }) {
  const shown = views.filter((v) => v.bands.length > 0);
  const [key, setKey] = useState(shown[0]?.key);
  const view = shown.find((v) => v.key === key) ?? shown[0];
  if (!view) return null;
  const values = view.bands.map(whPerKm);
  const known = values.filter((v): v is number => v !== null);
  const most = Math.max(...known, 0);
  const least = known.length > 0 ? Math.min(...known) : null;
  const sure = view.bands.filter((b) => b.drives >= FEW && whPerKm(b) !== null).sort((a, b) => whPerKm(a)! - whPerKm(b)!);
  const low = sure[0];
  const high = sure.at(-1);
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
      {low && high && low !== high && (
        <p className="text-sm">
          {at(low)} you used {wh(whPerKm(low)!)}. {at(high)}, {wh(whPerKm(high)!)}.
        </p>
      )}
      <ul className="space-y-3 text-sm tabular-nums" aria-label={`Wh/km by ${view.label.toLowerCase()}`}>
        {view.bands.map((b, k) => (
          <li key={b.label} className={cn("grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3", b.drives < FEW && "opacity-60")}>
            <span className="min-w-0">
              <span className="block">{b.label}</span>
              <span className="block text-xs text-muted-foreground">
                {b.drives} {b.drives === 1 ? "drive" : "drives"} · <Measure text={formatKm(b.km)} />
              </span>
            </span>
            <span className="h-2 bg-muted" aria-hidden="true">
              <span className={cn("block h-full", values[k] !== null && values[k] === least ? "bg-chart-accent" : "bg-chart-accent/40")} style={{ width: `${most > 0 ? ((values[k] ?? 0) / most) * 100 : 0}%` }} />
            </span>
            <span className={cn("text-right font-mono", values[k] === null && "text-faint")}>{values[k] !== null ? formatNumber(values[k]!, DECIMALS.whPerKm) : "—"}</span>
          </li>
        ))}
      </ul>
      {few && <p className="text-xs text-faint">Faint rows come from fewer than {FEW} drives, so they say less.</p>}
    </div>
  );
}
