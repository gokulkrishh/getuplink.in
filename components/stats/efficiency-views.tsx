import { Measure } from "@/components/measure";
import type { Band } from "@/lib/driving-insights";
import { DECIMALS, formatKm, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EfficiencyView = { key: string; label: string; bands: Band[] };

const FEW = 3;

// Wh per km, as everywhere else in the app, by average speed, AC setting and outside temperature, one group
// under the other on one scale, so a bar under Speed compares with a bar under AC setting. The ways split the
// same drives differently, so they can't be crossed into one table: crossed, most cells would hold a drive
// or none. Each row is the band, a bar for its Wh/km against the highest of all, and the figure, with its
// drives and distance under the band. The lowest in each group is drawn in the accent colour. A line on top
// names the group with the widest gap between its lowest and highest band, counting only bands from FEW or
// more drives: a band from fewer is faint, as one drive says little.
const whPerKm = (b: Band) => (b.kmPerKwh ? 1000 / b.kmPerKwh : null);
const wh = (n: number) => formatNumber(n, DECIMALS.whPerKm);

function widest(views: EfficiencyView[]) {
  let best: { label: string; low: number; high: number } | null = null;
  for (const v of views) {
    const sure = v.bands.filter((b) => b.drives >= FEW).flatMap((b) => whPerKm(b) ?? []);
    if (sure.length < 2) continue;
    const low = Math.min(...sure);
    const high = Math.max(...sure);
    if (!best || high - low > best.high - best.low) best = { label: v.label, low, high };
  }
  return best && best.high > best.low ? best : null;
}

export function EfficiencyViews({ views }: { views: EfficiencyView[] }) {
  const shown = views.filter((v) => v.bands.length > 0);
  if (shown.length === 0) return null;
  const most = Math.max(...shown.flatMap((v) => v.bands.flatMap((b) => whPerKm(b) ?? [])), 0);
  const gap = widest(shown);
  const few = shown.some((v) => v.bands.some((b) => b.drives < FEW));
  return (
    <div className="space-y-6">
      {gap && (
        <p className="text-sm">
          {gap.label} made the biggest difference: {wh(gap.low)} to {wh(gap.high)} Wh/km.
        </p>
      )}
      {shown.map((view) => {
        const values = view.bands.map(whPerKm);
        const known = values.filter((v): v is number => v !== null);
        const least = known.length > 1 ? Math.min(...known) : null;
        return (
          <div key={view.key} className="space-y-3">
            <h3 className="text-sm font-medium">{view.label}</h3>
            <ul className="space-y-3 text-sm tabular-nums" aria-label={`Wh/km by ${view.label.toLowerCase()}`}>
              {view.bands.map((b, k) => (
                <li key={b.label} className={cn("grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3", b.drives < FEW && "opacity-60")}>
                  <span className="min-w-0">
                    <span className="block">{b.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.drives} {b.drives === 1 ? "drive" : "drives"} · <Measure text={formatKm(b.km)} />
                    </span>
                  </span>
                  <span className="h-2 bg-muted" aria-hidden="true">
                    <span className={cn("block h-full", values[k] !== null && values[k] === least ? "bg-chart-accent" : "bg-chart-accent/40")} style={{ width: `${most > 0 ? ((values[k] ?? 0) / most) * 100 : 0}%` }} />
                  </span>
                  <span className={cn("text-right font-mono", values[k] === null && "text-faint")}>{values[k] !== null ? (
                      <>
                        {wh(values[k]!)}
                        <span className="ml-1 font-sans text-xs text-muted-foreground">Wh/km</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {few && <p className="text-xs text-faint">Faint rows come from fewer than {FEW} drives, so they say less.</p>}
    </div>
  );
}
