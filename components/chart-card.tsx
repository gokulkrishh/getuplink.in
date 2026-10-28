import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { InfoButton } from "@/components/info-button";
import { Captioned, EmptyChart } from "@/components/stats/bars";
import { cn } from "@/lib/utils";

// Every chart in the app, wrapped the same way (see docs/charts.md): a sentence-case title with an ⓘ beside
// it, one short line on what the chart shows, optional tiles or a headline value, the chart itself, and at
// most one short caption under it. The period is named once, at the top; the caption is for caveats. The ⓘ opens `info`, a note the page
// doesn't already say; a chart without one has no ⓘ.
// The unit itself is drawn once, by the chart, above its y axis (as ChartFrame and DriveTrace do). With
// `empty`, one sentence sits in the chart's place and the caption is left out; on a page where a chart has
// no data, don't render the card at all.
// Server-safe: no hooks, so it wraps server sections and client plots alike (InfoButton is its own client
// component).
export function ChartCard({
  title,
  description,
  info,
  caption,
  summary,
  empty,
  as: Heading = "h2",
  fold = false,
  className,
  children,
}: {
  // "Speed": what is measured, sentence case, no unit. Left out when the chart is its section's only one and
  // the section's title names it.
  title?: string;
  // "Battery lost while parked. Lower is better.": one short sentence on what it shows.
  description?: ReactNode; // Left out when the title and headline already say it all.
  // Method notes for the ⓘ popover: how a figure is worked out, what a mark or a gap means.
  info?: ReactNode;
  // One short line under the chart, only for what the top doesn't say: a caveat ("Readings go back to 25
  // Sept", "Newest first") or the bars' span when it differs from the period. Never the period itself: that
  // is named once, in the headline or the description (see docs/charts.md).
  caption?: ReactNode;
  // Tiles or a headline value between the description and the chart.
  summary?: ReactNode;
  // Like "No driving today.", a whole sentence: shown in place of the chart.
  empty?: ReactNode;
  // h2 when the chart is the section; h3 under a section's own h2.
  as?: "h2" | "h3";
  // A row in a long list (Owners): the title and line show, and a tap opens the chart under them. The ⓘ's
  // note then sits in the opened part, since a button in the row would toggle it.
  fold?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  if (fold) {
    return (
      <details className={cn("group/fold border-b", className)}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 space-y-1">
            {title && <Heading className="text-base font-medium tracking-heading">{title}</Heading>}
            {description && <span className="block text-sm text-muted-foreground">{description}</span>}
          </span>
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/fold:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-4 pb-6">
          {info && <p className="text-sm text-faint">{info}</p>}
          {summary}
          {empty ? <EmptyChart>{empty}</EmptyChart> : <Captioned caption={caption}>{children}</Captioned>}
        </div>
      </details>
    );
  }
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        {title && (
          <div className="flex items-center gap-1.5">
            <Heading className={cn("font-medium tracking-heading", Heading === "h2" ? "text-lg" : "text-base")}>{title}</Heading>
            <InfoButton label={title}>
              {info}
            </InfoButton>
          </div>
        )}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {summary}
      {empty ? <EmptyChart>{empty}</EmptyChart> : <Captioned caption={caption}>{children}</Captioned>}
    </section>
  );
}
