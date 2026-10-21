import { cn } from "@/lib/utils";

export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean };

// 6 or 12 columns. Value labels are dropped at 12 so they don't collide on a phone.
export function Bars({ bars, ariaLabel }: { bars: Bar[]; ariaLabel: string }) {
  const dense = bars.length > 6;
  const max = Math.max(...bars.map((b) => b.value));
  // Slots before the first value stay blank, so the bars start where the history starts.
  const first = bars.findIndex((b) => b.value > 0);

  return (
    <div className="bg-muted px-4 pt-5 pb-3">
      <ol className={cn("grid items-end", dense ? "grid-cols-12 gap-1" : "grid-cols-6 gap-3")} aria-label={ariaLabel}>
        {bars.map((b, k) =>
          k < first ? (
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
              <span className={cn("text-xs", b.isCurrent ? "text-foreground" : "text-faint")}>{dense ? b.label.slice(0, 1) : b.label}</span>
              {dense && <span className="sr-only">{b.display}</span>}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
