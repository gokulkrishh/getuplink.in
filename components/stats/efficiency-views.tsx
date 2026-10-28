import { Measure } from "@/components/measure";
import type { Band } from "@/lib/driving-insights";
import { DECIMALS, formatKm, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EfficiencyView = { key: string; label: string; bands: Band[] };

// A band from fewer drives than this is left out: a drive or two says more about that trip than about the
// speed, AC setting or weather.
const ENOUGH = 5;

// Wh per km, as everywhere else in the app, by average speed, AC setting and outside temperature, one group
// under the other on one scale. Only bands from ENOUGH drives show, and a group needs two of them to compare;
// with none, the card isn't shown. No line names a group as the cause: the ways split the same drives, so a
// short trip in town is both a slow band and its AC setting, and the figures can't say which made it cost
// more. Each row is the band, a bar for its Wh/km against the highest of all, and the figure, with its drives
// and distance under it. The lowest in each group is drawn in the accent colour.
const whPerKm = (b: Band) => (b.kmPerKwh ? 1000 / b.kmPerKwh : null);
const wh = (n: number) => formatNumber(n, DECIMALS.whPerKm);

export function EfficiencyViews({ views }: { views: EfficiencyView[] }) {
  const shown = views
    .map((v) => ({ ...v, bands: v.bands.filter((b) => b.drives >= ENOUGH && whPerKm(b) !== null) }))
    .filter((v) => v.bands.length >= 2);
  if (shown.length === 0) return null;
  const most = Math.max(...shown.flatMap((v) => v.bands.flatMap((b) => whPerKm(b) ?? [])), 0);
  return (
    <div className="space-y-6">
      {shown.map((view) => {
        const values = view.bands.map(whPerKm);
        const known = values.filter((v): v is number => v !== null);
        const least = known.length > 1 ? Math.min(...known) : null;
        return (
          <div key={view.key} className="space-y-3">
            <h3 className="text-sm font-medium">{view.label}</h3>
            <ul className="space-y-3 text-sm tabular-nums" aria-label={`Wh/km by ${view.label.toLowerCase()}`}>
              {view.bands.map((b, k) => (
                <li key={b.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
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
    </div>
  );
}
