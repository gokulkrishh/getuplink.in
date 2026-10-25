import { Measure } from "@/components/measure";
import { cn } from "@/lib/utils";

// The pieces Bars, BarColumns and StackedBars share. No directive: they render on either side.

// `tip` is an extra line under the value in the hover tip, like "16 of 40 cars". `axis` is a shorter label
// for under the bar when `label` (the tip's title) is too long to fit there, like "20" for "20 to 40 km/h".
export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean; blank?: boolean; tip?: string; axis?: string };

// The widest a bar gets, so one bar in a wide column (or 6 on a desktop) isn't a block. Bars sit centred in their columns.
export const BAR_MAX = "max-w-12";

// The narrowest a column (bar and gap) gets, in px. A chart with more columns than fit at this width,
// like 90 days on a phone, scrolls sideways (ScrollEnd) from its newest end instead of squeezing its bars
// to slivers; 6 or 12 columns always fit.
export const MIN_COLUMN_PX = 12;

// Below this many columns the bars keep their width and the right side stays empty.
export const MIN_COLUMNS = 6;

// "12 km", "1.2% a day": a space before a unit, none before a percent sign.
export function withUnit(value: string, unit?: string): string {
  return unit ? `${value}${unit.startsWith("%") ? "" : " "}${unit}` : value;
}

// A column's x-axis label: "Jan" rather than "January" on a dense chart. Which labels show is measured in
// the browser (useAxisLabels), so they start hidden and never collide.
export function AxisLabel({ label, dense, current }: { label: string; dense: boolean; current?: boolean }) {
  return (
    <span data-axis-label className={cn("invisible h-4 text-xs whitespace-nowrap", current ? "text-foreground" : "text-faint")}>
      {dense ? label.slice(0, 3) : label}
    </span>
  );
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
          <Measure text={line as string} />
        </span>
      ))}
    </span>
  );
}
