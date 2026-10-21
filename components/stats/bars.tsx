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
