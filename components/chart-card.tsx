import type { ReactNode } from "react";
import { ChartDownload } from "@/components/chart-download";
import { InfoButton } from "@/components/info-button";
import { Captioned, EmptyChart } from "@/components/stats/bars";
import { Fold } from "@/components/fold";
import { cn } from "@/lib/utils";

// The chart itself, the part a download saves. It keeps the spacing its parts had in the card (the
// section's, or the caption's figure's).
function plot(children: ReactNode, caption: ReactNode) {
  return (
    <div data-chart-plot="" className={caption ? "space-y-2" : "space-y-4"}>
      {children}
    </div>
  );
}

// Every chart in the app, wrapped the same way (see docs/charts.md): a sentence-case title with an ⓘ beside
// it, one short line on what the chart shows, optional tiles or a headline value, the chart itself, and at
// most one short caption under it. The period is named once, at the top; the caption is for caveats. The ⓘ opens `info`, a note the page
// doesn't already say; a chart without one has no ⓘ.
// The unit itself is drawn once, by the chart, above its y axis (as ChartFrame and DriveTrace do). With
// `empty`, one sentence sits in the chart's place and the caption is left out; on a page where a chart has
// no data, don't render the card at all.
// A download button at the top right saves the chart itself as an image (ChartDownload), without the
// title, figures or caption round it. A card showing `empty` has none, nor one with `download={false}`.
// Server-safe: no hooks, so it wraps server sections and client plots alike (InfoButton and Fold are their
// own client components).
export function ChartCard({
  title,
  description,
  info,
  caption,
  summary,
  empty,
  as: Heading = "h2",
  fold = false,
  shut,
  download = true,
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
  // A row in a long list (Owners): the title and line show, and a tap opens the chart under them. The list
  // draws the lines between rows, so the last has none under it and the first none above. The ⓘ's
  // note then sits in the opened part, since a button in the row would toggle it.
  fold?: boolean;
  // The chart starts closed, behind a row with `label` ("By AC setting and outside temperature") and Show,
  // when the description already says what it holds (Efficiency's sentence). The opened part leads with
  // `note` ("Lower is better.") and the download button, as a fold row's does. The caption stays under the row.
  shut?: { label: string; note?: string };
  // False for a sample chart on the public home page, which has nothing of the owner's to save.
  download?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  if (fold) {
    return (
      <Fold data-chart-card="" className={cn("group/fold", className)} rowClassName="py-4" as={Heading} titleClassName="text-base" toggle="chevron" title={title} description={description} contentClassName="space-y-4 pb-6">
          {info || (download && !empty) ? (
            <div className="flex items-start justify-between gap-3">
              {info ? <p className="text-sm text-faint">{info}</p> : <span />}
              {download && !empty && <ChartDownload title={title} />}
            </div>
          ) : null}
          {summary}
          {empty ? <EmptyChart>{empty}</EmptyChart> : <Captioned caption={caption}>{plot(children, caption)}</Captioned>}
      </Fold>
    );
  }
  return (
    <section data-chart-card="" className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
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
        {download && !empty && !shut && <ChartDownload title={title} className={Heading === "h2" ? "mt-0.5" : undefined} />}
      </div>
      {summary}
      {empty ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : shut ? (
        <Captioned caption={caption}>
          {/* The label isn't a heading: the card's title above is. */}
          <Fold className="border-y" rowClassName="py-2 text-sm" headClassName="" as="span" title={shut.label} contentClassName="space-y-4 pt-2 pb-6">
              {(shut.note || download) && (
                <div className="flex items-center justify-between gap-3">
                  {shut.note ? <p className="text-sm text-faint">{shut.note}</p> : <span />}
                  {download && <ChartDownload title={title} />}
                </div>
              )}
              {plot(children, undefined)}
          </Fold>
        </Captioned>
      ) : (
        <Captioned caption={caption}>{plot(children, caption)}</Captioned>
      )}
    </section>
  );
}
