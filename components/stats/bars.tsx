import { ScrollEnd } from "@/components/stats/scroll-end";
import { TapColumns } from "@/components/stats/tap-columns";
import { cn } from "@/lib/utils";

export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean; blank?: boolean };

// 6 or 12 columns. Value labels are dropped at 12 so they don't collide on a phone.
// With labelEvery, any number of columns (one per day, say): only every labelEvery-th column from the
// last one carries its label, and values live in the hover title and for screen readers.
// With visible, only that many columns fit the panel and the rest scroll sideways, opening on the newest.
// Otherwise each column is at least as wide as its label and value (see minListWidth), so on a phone a
// chart with long labels scrolls sideways rather than running them together; `scrollFrom` says which end
// it opens on.
// With empty, a period with nothing to show says so (EmptyChart) instead of drawing an empty frame.
// `unit` titles the y axis and follows each value in the hover tip and for screen readers; `display` is
// the bare number (money carries its own sign, with `prefix` on the axis).
export function Bars({
  bars: all,
  ariaLabel,
  labelEvery,
  visible,
  prefix,
  unit,
  empty,
  scrollFrom = "end",
}: {
  bars: Bar[];
  ariaLabel: string;
  labelEvery?: number;
  visible?: number;
  // Put before the y-axis numbers, like "₹".
  prefix?: string;
  // Like "km" or "% a day".
  unit?: string;
  // Like "No driving today".
  empty?: string;
  // "start" for categories (speed bands), "end" for time, opening on the newest.
  scrollFrom?: "start" | "end";
}) {
  if (empty && !all.some((b) => b.value > 0)) return <EmptyChart>{empty}</EmptyChart>;
  const dense = all.length > 6;
  // Months before the history starts are dropped, so the bars begin at the left edge.
  const bars = labelEvery ? all : leadingTrimmed(all, (b) => b.value > 0);
  const max = niceMax(Math.max(1, ...bars.map((b) => b.value)));
  // Slots before the first value stay blank, so the bars start where the history starts.
  const first = bars.findIndex((b) => b.value > 0);
  const hidden = (b: Bar, k: number) => b.blank ?? k < first;
  const labelled = (k: number) => (labelEvery ? (bars.length - 1 - k) % labelEvery === 0 : true);

  const columns = labelEvery ? bars.length : Math.max(bars.length, MIN_COLUMNS);
  const minWidth = labelEvery ? 0 : minListWidth(bars, columns, dense);
  const scrolls = (visible !== undefined && bars.length > visible) || minWidth > 0;
  const list = (
      <TapColumns
        className={cn("grid items-end", labelEvery ? "gap-0.5" : dense ? "gap-1" : "gap-3")}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          width: visible !== undefined && bars.length > visible ? `${(bars.length / visible) * 100}%` : undefined,
          minWidth: minWidth || undefined,
        }}
        aria-label={ariaLabel}
      >
        {bars.map((b, k) =>
          hidden(b, k) ? (
            <li key={b.key} aria-hidden="true" />
          ) : (
            <li key={b.key} className="group relative flex flex-col items-center gap-2">
              <BarTip at={k} of={bars.length} lines={[withUnit(b.display, unit)]} title={b.label} />
              {!dense && <span className="font-mono text-xs text-muted-foreground tabular-nums">{b.display}</span>}
              <div className="flex h-20 w-full items-end">
                {b.value > 0 && (
                  <div
                    className={cn("w-full", b.isCurrent ? "bg-chart-accent" : "bg-muted-foreground/40 group-hover:bg-muted-foreground/70 group-data-[tapped=true]:bg-muted-foreground/70")}
                    style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }}
                  />
                )}
              </div>
              {/* The label is as wide as its text and may spill over the neighbouring columns. */}
              <span className={cn("h-4 text-xs whitespace-nowrap", b.isCurrent ? "text-foreground" : "text-faint")}>
                {labelEvery ? (labelled(k) ? b.label : "") : <MonthLabel label={b.label} dense={dense} fromEnd={bars.length - 1 - k} />}
              </span>
              {dense && <span className="sr-only">{withUnit(b.display, unit)}</span>}
            </li>
          ),
        )}
      </TapColumns>
  );
  return (
    <ChartFrame max={max} dense={dense} prefix={prefix} unit={unit}>
      {scrolls ? (
        <ScrollEnd label={ariaLabel} from={scrollFrom}>
          {list}
        </ScrollEnd>
      ) : (
        list
      )}
    </ChartFrame>
  );
}

// The narrowest the columns can be with each label and value still clear of its neighbours, in px, for a
// list's min-width: text-xs runs about 6.5px a character in the sans and 7.5px in the mono, plus room
// between. A dense chart shortens its labels and drops every other one on a phone (MonthLabel), so it
// needs no floor. The gap matches the list's gap-3.
export function minListWidth(bars: { label: string; display: string }[], columns: number, dense: boolean): number {
  if (dense) return 0;
  const longest = (texts: string[]) => Math.max(0, ...texts.map((t) => t.length));
  const column = Math.max(longest(bars.map((b) => b.label)) * 6.5, longest(bars.map((b) => b.display)) * 7.5) + 6;
  return Math.ceil(columns * column + (columns - 1) * 12);
}

// In place of a bar chart with nothing in it: the panel, about a chart's height, with a short note.
export function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex h-40 items-center justify-center bg-muted px-4 text-center text-sm text-faint">{children}</div>;
}

// "12 km", "1.2% a day": a space before a unit, none before a percent sign.
export function withUnit(value: string, unit?: string): string {
  return unit ? `${value}${unit.startsWith("%") ? "" : " "}${unit}` : value;
}

// The y-axis top: the data's maximum rounded up to 1, 2, 2.5 or 5 times a power of ten.
export function niceMax(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((m) => value <= m * step) ?? 10) * step;
}

const axisNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

// The panel with a y axis (0, half and the top) on the left and matching gridlines behind the bars. The
// axis lines up with the bars' h-20 area: below the value labels (h-4 plus the gap) unless the chart is
// dense, and above the x-axis labels. The bottom gridline is the x axis. `unit` sits above the axis, in
// the top padding; a dense chart has its top number there too, so it gets a little more room.
export function ChartFrame({ max, dense, prefix = "", unit, children }: { max: number; dense: boolean; prefix?: string; unit?: string; children: React.ReactNode }) {
  const top = dense ? "top-0" : "top-6";
  return (
    <div className={cn("chart-touch relative flex gap-2 bg-muted pr-4 pb-3 pl-2", unit && dense ? "pt-8" : "pt-5")}>
      {unit && (
        <span className="absolute top-1 left-2 font-mono text-xs text-faint" aria-hidden="true">
          {unit}
        </span>
      )}
      <div className={cn("relative w-8 shrink-0", dense ? "mb-6" : "my-6")} aria-hidden="true">
        <div className="relative h-20 text-right font-mono text-xs whitespace-nowrap text-faint tabular-nums">
          {[max, max / 2, 0].map((v, i) => (
            <span key={i} className={cn("absolute right-0", i === 0 ? "top-0 -translate-y-1/2" : i === 1 ? "top-1/2 -translate-y-1/2" : "bottom-0 translate-y-1/2")}>
              {prefix}
              {axisNumber.format(v)}
            </span>
          ))}
        </div>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className={cn("pointer-events-none absolute inset-x-0 h-20", top)} aria-hidden="true">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-muted-foreground/40" />
        </div>
        {children}
      </div>
    </div>
  );
}

// 12 columns: "Jan" rather than "J", and on a phone only every other month (counted from the newest) so
// the names don't collide.
export function MonthLabel({ label, dense, fromEnd }: { label: string; dense: boolean; fromEnd: number }) {
  if (!dense) return label;
  return <span className={cn(fromEnd % 2 === 1 && "max-sm:invisible")}>{label.slice(0, 3)}</span>;
}

// The value of the column under the pointer or tapped (see TapColumns), like the version chart's tooltip. It overlays the top of
// the column (so a scrolling strip can't clip it) and leans inwards at the edges. Screen readers get the
// same values from each column's sr-only text.
export function BarTip({ title, lines, at, of }: { title: string; lines: (string | null | false)[]; at: number; of: number }) {
  const side = at < of / 4 ? "left-0" : at > (of * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[tapped=true]:opacity-100",
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
export const MIN_COLUMNS = 6;

export function leadingTrimmed<T>(items: T[], hasValue: (item: T) => boolean): T[] {
  const first = items.findIndex(hasValue);
  return first > 0 ? items.slice(first) : items;
}
