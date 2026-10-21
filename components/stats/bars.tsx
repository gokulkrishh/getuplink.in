import { cn } from "@/lib/utils";

export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean; blank?: boolean };

// 6 or 12 columns. Value labels are dropped at 12 so they don't collide on a phone.
// With labelEvery, any number of columns (one per day, say): only every labelEvery-th column from the
// last one carries its label, and values live in the hover title and for screen readers.
export function Bars({ bars, ariaLabel, labelEvery }: { bars: Bar[]; ariaLabel: string; labelEvery?: number }) {
  const dense = bars.length > 6;
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Slots before the first value stay blank, so the bars start where the history starts.
  const first = bars.findIndex((b) => b.value > 0);
  const hidden = (b: Bar, k: number) => b.blank ?? k < first;
  const labelled = (k: number) => (labelEvery ? (bars.length - 1 - k) % labelEvery === 0 : true);

  return (
    <div className="bg-muted px-4 pt-5 pb-3">
      <ol
        className={cn("grid items-end", !labelEvery && (dense ? "grid-cols-12 gap-1" : "grid-cols-6 gap-3"), labelEvery && "gap-0.5")}
        style={labelEvery ? { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` } : undefined}
        aria-label={ariaLabel}
      >
        {bars.map((b, k) =>
          hidden(b, k) ? (
            <li key={b.key} aria-hidden="true" />
          ) : (
            <li key={b.key} className="flex flex-col items-center gap-2" title={`${b.label}: ${b.display}`}>
              {!dense && <span className="font-mono text-xs text-muted-foreground tabular-nums">{b.display}</span>}
              <div className="flex h-20 w-full items-end">
                {b.value > 0 && (
                  <div
                    className={cn("w-full", b.isCurrent ? "bg-foreground" : "bg-muted-foreground/40")}
                    style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
                  />
                )}
              </div>
              {/* The label is as wide as its text and may spill over the neighbouring columns. */}
              <span className={cn("h-4 text-xs whitespace-nowrap", b.isCurrent ? "text-foreground" : "text-faint")}>
                {labelEvery ? (labelled(k) ? b.label : "") : dense ? b.label.slice(0, 1) : b.label}
              </span>
              {dense && <span className="sr-only">{b.display}</span>}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

export type StackedBar = { key: string; label: string; total: number; display: string; isCurrent: boolean; segments: number[] };
export type StackedSeries = { label: string; className: string };

// Same look as Bars, with each column split into series (first series at the bottom). Tones tell the
// series apart, a 2px gap separates them, and the legend names them.
export function StackedBars({ bars, series, ariaLabel }: { bars: StackedBar[]; series: StackedSeries[]; ariaLabel: string }) {
  const dense = bars.length > 6;
  const max = Math.max(...bars.map((b) => b.total));
  const first = bars.findIndex((b) => b.total > 0);
  const used = series.filter((_, i) => bars.some((b) => b.segments[i] > 0));
  const breakdown = (b: StackedBar) => series.map((s, i) => (b.segments[i] > 0 ? `${s.label} ${b.segments[i].toFixed(1)} kWh` : null)).filter(Boolean);

  return (
    <div className="bg-muted px-4 pt-5 pb-3">
      <ol className={cn("grid items-end", dense ? "grid-cols-12 gap-1" : "grid-cols-6 gap-3")} aria-label={ariaLabel}>
        {bars.map((b, k) =>
          k < first ? (
            <li key={b.key} aria-hidden="true" />
          ) : (
            <li key={b.key} className="flex flex-col items-center gap-2" title={[`${b.label}: ${b.display}`, ...breakdown(b)].join("\n")}>
              {!dense && <span className="font-mono text-xs text-muted-foreground tabular-nums">{b.display}</span>}
              <div className="flex h-20 w-full items-end">
                {b.total > 0 && (
                  <div className="flex w-full flex-col-reverse gap-0.5" style={{ height: `${Math.max(4, (b.total / max) * 100)}%` }}>
                    {series.map((s, i) =>
                      b.segments[i] > 0 ? <div key={s.label} className={cn("min-h-px", s.className)} style={{ flex: `${b.segments[i]} 1 0%` }} /> : null,
                    )}
                  </div>
                )}
              </div>
              <span className={cn("text-xs", b.isCurrent ? "text-foreground" : "text-faint")}>{dense ? b.label.slice(0, 1) : b.label}</span>
              <span className="sr-only">
                {dense && `${b.display}. `}
                {breakdown(b).join(", ")}
              </span>
            </li>
          ),
        )}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
        {used.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-2", s.className)} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
