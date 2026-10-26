import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Measure } from "@/components/measure";
import { showsZero } from "@/lib/format";
import { statsHref, type View } from "@/components/stats/periods";
import { measureParts } from "@/lib/measure";
import type { SlotDays } from "@/lib/periods";
import { cn } from "@/lib/utils";

// The pieces Bars, BarColumns and StackedBars share. No directive: they render on either side.

// `tip` is what the tip adds under the value, which the chart has no room for: a line, or several, like
// "16 of 40 cars" or "3 drives" and "1 h 20 min driving". `axis` is a shorter label for under the bar when
// `label` is too long to fit there, like "20" for "20 to 40 km/h". `edge` puts `axis` on the column's
// start boundary, with a tick, instead of centred under it: for blocks of hours, where "6 AM" under the
// 6 AM to 9 AM bar reads as "at 6 AM" (see Slot). `days` is the day, month or year the bar covers, when it
// covers one: the tip's title in full ("Sun, 26 Oct") and what the column opens (see barOpens).
export type Bar = { key: string; label: string; value: number; display: string; isCurrent: boolean; blank?: boolean; tip?: string | string[]; axis?: string; edge?: boolean; days?: SlotDays };

// The tip's title: the bar's days in full where it covers a day, a month or a year, else its label.
export const barTitle = (b: Pick<Bar, "label" | "days">) => b.days?.title ?? b.label;

// The tip's extra lines, as given.
export const tipLines = (tip: string | string[] | undefined): string[] => (tip === undefined ? [] : Array.isArray(tip) ? tip : [tip]);

// Where a column leads, and the words for it in the tip: a bar of one day opens that day's page; a bar of a
// month or a year opens the same days on `view`'s Stats page as a range picked by date. A bar of hours leads
// nowhere, nor does a month or year on a chart that names no page (Home's previews), nor a bar of speeds.
export type Opens = { href: string; label: string };

export function barOpens(days: SlotDays | undefined, view?: View): Opens | null {
  if (!days) return null;
  if (days.kind === "day") return { href: `/stats/day/${days.from}`, label: "Open day" };
  return view ? { href: statsHref(view, "custom", { from: days.from, to: days.to }), label: `Open ${days.kind}` } : null;
}

// What a column holds. Tab reaches it, with a ring, so its tip can be read without a pointer (focus shows the
// tip like hover does, see BarTip); when the column leads somewhere (`opens`) it is a link there, which a
// click or Enter follows. `words` is the column for screen readers, its label first: the axis label under
// the bar is visual only, shown only where it fits.
export function Column({ opens, words, children }: { opens: Opens | null; words: string; children: ReactNode }) {
  const className = "flex w-full flex-col items-center gap-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
  const sr = <span className="sr-only">{words}</span>;
  if (opens) {
    return (
      <Link href={opens.href} prefetch={false} className={className}>
        {children}
        {sr}
      </Link>
    );
  }
  return (
    <div tabIndex={0} className={className}>
      {children}
      {sr}
    </div>
  );
}

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

// A column's x-axis label, written out in full ("6 AM", "Sept", "25 Oct"), never cut short: which labels
// show is measured in the browser (useAxisLabels), so they start hidden and never collide. With `edge`
// it is centred on the column's start boundary (the gap before it), under a short tick from the baseline,
// so a block of hours reads like a clock axis: the 6 AM to 9 AM bar sits between "6 AM" and "9 AM".
export function AxisLabel({ label, current, edge, first }: { label: string; current?: boolean; edge?: boolean; first?: boolean }) {
  return (
    <>
      {edge && (
        // The baseline is the value row (h-4) and gap (2) plus the bars' h-20 below the column's top: 104px.
        // The gap between columns is gap-1, so their boundary is 2px before this one.
        <span aria-hidden="true" className={cn("pointer-events-none absolute top-26 h-1 w-px bg-muted-foreground/40", first ? "left-0" : "-left-0.5")} />
      )}
      <span data-axis-label data-axis-edge={edge || undefined} aria-hidden="true" className={cn("invisible h-4 text-xs whitespace-nowrap", current ? "text-foreground" : "text-faint")}>
        {label}
      </span>
    </>
  );
}

// A column's value above its bar, with its unit ("46.2 km", "25%", "₹243.52") when every column's fits,
// else the bare number, else nothing (the tip still has it): which shows is measured in the browser
// (useValueLabels), starting hidden, so values never collide on a phone. Screen readers get the column's
// sr-only text instead.
// A bar that shows as zero gets no label above it; its tip still says "0 km".
export function ValueLabel({ display, unit }: { display: string; unit?: string }) {
  if (showsZero(display)) return <span className="h-4" />;
  const full = withUnit(display, unit);
  // The unit small and close, as on a tile, so six "17.0 km" fit across a phone.
  const parts = measureParts(full);
  return (
    <span data-value-label aria-hidden="true" className="invisible relative h-4 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      <span data-value="full">
        {parts.map((part, k) =>
          part.unit ? (
            <span key={k} className={cn("font-sans text-xs text-faint", k > 0 && "ml-px")}>
              {part.text}
            </span>
          ) : (
            <Fragment key={k}>{part.text}</Fragment>
          ),
        )}
      </span>
      {full !== display && (
        <span data-value="bare" className="hidden">
          {display}
        </span>
      )}
    </span>
  );
}

// The value of the column under the pointer, tapped (see TapColumns) or focused (see Column), like the version
// chart's tooltip. It overlays the top of the column (so a scrolling strip can't clip it), centred over the
// bar and nudged inside the chart at its ends (measured in the browser, see useBarTips). Screen readers get
// the same from each column's sr-only text. With `opens`, it ends with a link to where the column leads: on
// a phone the first tap shows the tip, and this link is the way on. Hidden, the tip is invisible, not just
// transparent, so the link takes no tap from the column under it.
export function BarTip({ title, lines, opens = null }: { title: string; lines: (string | null | false)[]; opens?: Opens | null }) {
  return (
    <span
      aria-hidden="true"
      data-bar-tip
      className={cn(
        "pointer-events-none invisible absolute top-0 left-0 z-10 border bg-background px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity duration-150",
        "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 group-data-[tapped=true]:visible group-data-[tapped=true]:opacity-100",
      )}
    >
      <span className="text-muted-foreground">{title}</span>
      {lines.filter(Boolean).map((line) => (
        <span key={line as string} className="block font-mono tabular-nums">
          <Measure text={line as string} />
        </span>
      ))}
      {opens && (
        // Not in the Tab order: the column itself is the link a keyboard follows.
        <Link href={opens.href} prefetch={false} tabIndex={-1} data-tip-link className="pointer-events-auto mt-0.5 block py-0.5 underline decoration-border decoration-dotted underline-offset-4 hover:decoration-foreground">
          {opens.label}
        </Link>
      )}
    </span>
  );
}
