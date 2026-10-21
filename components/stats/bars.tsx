import { ScrollEnd } from "@/components/stats/scroll-end";
import { cn } from "@/lib/utils";

export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean; blank?: boolean };

// 6 or 12 columns. Value labels are dropped at 12 so they don't collide on a phone.
// With labelEvery, any number of columns (one per day, say): only every labelEvery-th column from the
// last one carries its label, and values live in the hover title and for screen readers.
// With visible, only that many columns fit the panel and the rest scroll sideways, opening on the newest.
export function Bars({ bars: all, ariaLabel, labelEvery, visible }: { bars: Bar[]; ariaLabel: string; labelEvery?: number; visible?: number }) {
  const dense = all.length > 6;
  // Months before the history starts are dropped, so the bars begin at the left edge.
  const bars = labelEvery ? all : leadingTrimmed(all, (b) => b.value > 0);
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Slots before the first value stay blank, so the bars start where the history starts.
  const first = bars.findIndex((b) => b.value > 0);
  const hidden = (b: Bar, k: number) => b.blank ?? k < first;
  const labelled = (k: number) => (labelEvery ? (bars.length - 1 - k) % labelEvery === 0 : true);

  const scrolls = visible !== undefined && bars.length > visible;
  const list = (
      <ol
        className={cn("grid items-end", labelEvery ? "gap-0.5" : dense ? "gap-1" : "gap-3")}
        style={{
          gridTemplateColumns: `repeat(${labelEvery ? bars.length : Math.max(bars.length, MIN_COLUMNS)}, minmax(0, 1fr))`,
          width: scrolls ? `${(bars.length / visible) * 100}%` : undefined,
        }}
        aria-label={ariaLabel}
      >
        {bars.map((b, k) =>
          hidden(b, k) ? (
            <li key={b.key} aria-hidden="true" />
          ) : (
            <li key={b.key} className="group relative flex flex-col items-center gap-2">
              <BarTip at={k} of={bars.length} lines={[b.display]} title={b.label} />
              {!dense && <span className="font-mono text-xs text-muted-foreground tabular-nums">{b.display}</span>}
              <div className="flex h-20 w-full items-end">
                {b.value > 0 && (
                  <div
                    className={cn("w-full", b.isCurrent ? "bg-foreground" : "bg-muted-foreground/40 group-hover:bg-muted-foreground/70")}
                    style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
                  />
                )}
              </div>
              {/* The label is as wide as its text and may spill over the neighbouring columns. */}
              <span className={cn("h-4 text-xs whitespace-nowrap", b.isCurrent ? "text-foreground" : "text-faint")}>
                {labelEvery ? (labelled(k) ? b.label : "") : <MonthLabel label={b.label} dense={dense} fromEnd={bars.length - 1 - k} />}
              </span>
              {dense && <span className="sr-only">{b.display}</span>}
            </li>
          ),
        )}
      </ol>
  );
  return <div className="bg-muted px-4 pt-5 pb-3">{scrolls ? <ScrollEnd label={ariaLabel}>{list}</ScrollEnd> : list}</div>;
}

// 12 columns: "Jan" rather than "J", and on a phone only every other month (counted from the newest) so
// the names don't collide.
function MonthLabel({ label, dense, fromEnd }: { label: string; dense: boolean; fromEnd: number }) {
  if (!dense) return label;
  return <span className={cn(fromEnd % 2 === 1 && "max-sm:invisible")}>{label.slice(0, 3)}</span>;
}

// The value of the column under the pointer, like the version chart's tooltip. It overlays the top of
// the column (so a scrolling strip can't clip it) and leans inwards at the edges. Screen readers get the
// same values from each column's sr-only text.
function BarTip({ title, lines, at, of }: { title: string; lines: (string | null | false)[]; at: number; of: number }) {
  const side = at < of / 4 ? "left-0" : at > (of * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100",
        side,
      )}
    >
      <span className="text-muted-foreground">{title}</span>
      {lines.filter(Boolean).map((line) => (
        <span key={line as string} className="block font-mono tabular-nums">
          {line}
        </span>
      ))}
    </span>
  );
}

// Below this many columns the bars keep their width and the right side stays empty.
const MIN_COLUMNS = 6;

function leadingTrimmed<T>(items: T[], hasValue: (item: T) => boolean): T[] {
  const first = items.findIndex(hasValue);
  return first > 0 ? items.slice(first) : items;
}

export type StackedBar = { key: string; label: string; total: number; display: string; isCurrent: boolean; segments: number[] };
export type StackedSeries = { label: string; className: string };

// Same look as Bars, with each column split into series (first series at the bottom). Tones tell the
// series apart, a 2px gap separates them, and the legend names them.
export function StackedBars({ bars: all, series, ariaLabel }: { bars: StackedBar[]; series: StackedSeries[]; ariaLabel: string }) {
  const dense = all.length > 6;
  const bars = leadingTrimmed(all, (b) => b.total > 0);
  const max = Math.max(...bars.map((b) => b.total));
  const first = bars.findIndex((b) => b.total > 0);
  const used = series.filter((_, i) => bars.some((b) => b.segments[i] > 0));
  const breakdown = (b: StackedBar) => series.map((s, i) => (b.segments[i] > 0 ? `${s.label} ${b.segments[i].toFixed(1)} kWh` : null)).filter(Boolean);

  return (
    <div className="bg-muted px-4 pt-5 pb-3">
      <ol
        className={cn("grid items-end", dense ? "gap-1" : "gap-3")}
        style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, MIN_COLUMNS)}, minmax(0, 1fr))` }}
        aria-label={ariaLabel}
      >
        {bars.map((b, k) =>
          k < first ? (
            <li key={b.key} aria-hidden="true" />
          ) : (
            <li key={b.key} className="group relative flex flex-col items-center gap-2">
              <BarTip at={k} of={bars.length} lines={[`${b.total.toFixed(1)} kWh in total`, ...breakdown(b)]} title={b.label} />
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
              <span className={cn("text-xs whitespace-nowrap", b.isCurrent ? "text-foreground" : "text-faint")}>
                <MonthLabel label={b.label} dense={dense} fromEnd={bars.length - 1 - k} />
              </span>
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
