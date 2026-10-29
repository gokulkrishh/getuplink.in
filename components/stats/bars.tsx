import { BarColumns } from "@/components/stats/bar-columns";
import { type Bar, barOpens } from "@/components/stats/bar-parts";
import type { View } from "@/components/stats/periods";
import type { Stops } from "@/lib/bar-stops";
import { showsZero } from "@/lib/format";
import { cn } from "@/lib/utils";

export { AxisLabel, type Bar, BAR_MAX, BarTip, MIN_COLUMNS, withUnit } from "@/components/stats/bar-parts";

// 6 or 12 columns. Value labels are dropped at 12 so they don't collide on a phone.
// With labelEvery, any number of columns (one per day, say): labels are at least labelEvery columns apart from the
// last one (more when the chart is narrow), and values live in the hover title and for screen readers.
// Every column is at least MIN_COLUMN_PX wide: a chart with more than fit (90 days on a phone) scrolls
// sideways from its newest end, with the y axis staying put. The x-axis shows only the labels that fit,
// measured in the browser (useAxisLabels).
// With empty, a period with nothing to show says so in one line (EmptyChart) instead of drawing an empty frame.
// `caption` says in plain words what is plotted and over which bars (see chart-caption.ts); it sits under the
// panel so a caption that wraps differently in another period never moves the chart.
// Every drawn period has the same box: the value row is kept (blank when dense), so a switch between 6 and
// 12 columns doesn't change the chart's height. Each slot keeps its column, those
// before the history starts drawn blank, and a bar is never wider than BAR_MAX.
// `unit` titles the y axis and follows each value in the hover tip and for screen readers; `display` is
// the bare number (money carries its own sign, with `prefix` on the axis).
// The columns are drawn by BarColumns in the browser, from the bars, so the page carries data, not markup.
export function Bars({
  bars,
  ariaLabel,
  labelEvery,
  prefix,
  unit,
  empty,
  caption,
  fit = false,
  xUnit,
  valueWords,
  valueLabel,
  view,
  stops,
}: {
  bars: Bar[];
  ariaLabel: string;
  labelEvery?: number;
  // Put before the y-axis numbers, like "₹".
  prefix?: string;
  // Like "km" or "% a day".
  unit?: string;
  // Like "No driving today.", a whole sentence.
  empty?: string;
  // Like "Kilometres driven each month, May to Oct".
  caption?: string;
  // Squeeze every column into the panel's width instead of scrolling sideways (see BarColumns).
  fit?: boolean;
  // The x axis's unit when it isn't time, like "km/h" under speed bands.
  xUnit?: string;
  // Words after the value in the tip, like "of driving time".
  valueWords?: string;
  // Names each bar's figure in its tip, like "Distance" (see BarColumns).
  valueLabel?: string;
  // The Stats page a bar of a month or a year opens, as a range picked by date (see barOpens). A bar of
  // one day opens the day's page on any chart.
  view?: View;
  // The drives or charges behind the bars, so a day with just one opens it (see barOpens).
  stops?: Stops;
}) {
  if (empty && !bars.some((b) => b.value > 0 && !showsZero(b.display))) return <EmptyChart>{empty}</EmptyChart>;
  const max = niceMax(Math.max(1, ...bars.map((b) => b.value)));
  return (
    <Captioned caption={caption}>
      <ChartFrame max={max} prefix={prefix} unit={unit} xUnit={xUnit}>
        <BarColumns bars={bars.map((b) => ({ ...b, opens: barOpens(b.days, view, stops) }))} max={max} ariaLabel={ariaLabel} labelEvery={labelEvery} unit={unit} valueWords={valueWords} valueLabel={valueLabel} fit={fit} />
      </ChartFrame>
    </Captioned>
  );
}

// A chart with its caption underneath, or just the chart.
export function Captioned({ caption, children }: { caption?: React.ReactNode; children: React.ReactNode }) {
  if (!caption) return children;
  return (
    <figure className="space-y-2">
      {children}
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}


// In place of a chart with nothing in it: one short sentence ("No bills today."), not an empty panel. The
// caption is left out; the sentence already says which period.
export function EmptyChart({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

// The y-axis top: the data's maximum rounded up to 1, 2, 2.5 or 5 times a power of ten.
export function niceMax(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((m) => value <= m * step) ?? 10) * step;
}

const axisNumber = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

// The panel with a y axis (0, half and the top) on the left and matching gridlines behind the bars. The
// axis lines up with the bars' h-20 area: below the value row (h-4 plus the gap, kept blank on a dense
// chart) and above the x-axis labels. The bottom gridline is the x axis. `unit` sits above the axis, in
// the top padding. One geometry for every chart, 160px tall like EmptyChart, so periods with 6, 8 or 12
// columns, or none, keep the same box. The y-axis gutter is a fixed w-8. `xUnit` titles an x axis that
// isn't time ("km/h" under speed bands), in the gutter's bottom corner, level with the x-axis labels.
export function ChartFrame({ max, prefix = "", unit, xUnit, children }: { max: number; prefix?: string; unit?: string; xUnit?: string; children: React.ReactNode }) {
  return (
    <div className="chart-touch relative flex gap-2 bg-muted dark:bg-card pt-5 pr-4 pb-3 pl-2">
      {unit && (
        <span className="absolute top-1 left-2 font-mono text-xs text-faint" aria-hidden="true">
          {unit}
        </span>
      )}
      {unit && (
        // Shown by useValueLabels only when the values above the bars are bare numbers, so they read "km 17.0 15.7".
        <span data-value-unit className="absolute top-5 left-2 hidden h-4 w-8 text-right font-sans text-xs leading-4 text-faint" aria-hidden="true">
          {unit}
        </span>
      )}
      {xUnit && (
        <span className="absolute bottom-3 left-2 h-4 w-8 text-right font-mono text-xs leading-4 text-faint" aria-hidden="true">
          {xUnit}
        </span>
      )}
      <div className="relative my-6 w-8 shrink-0" aria-hidden="true">
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
        <div className={"pointer-events-none absolute inset-x-0 top-6 h-20"} aria-hidden="true">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-muted-foreground/40" />
        </div>
        {children}
      </div>
    </div>
  );
}
