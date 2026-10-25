import type { ReactNode } from "react";
import { Captioned, EmptyChart } from "@/components/stats/bars";
import { unitNotes } from "@/lib/unit-words";
import { cn } from "@/lib/utils";

// Every chart in the app, wrapped the same way (see docs/charts.md): a sentence-case title, one plain
// line on what the chart shows and how to read it, optional tiles or a headline value, the chart itself,
// and a caption under it. The caption ends with the unit's plain words from the glossary
// (lib/unit-words.ts) when the unit isn't obvious, so "kW" or "Wh/km" is always explained, then the words
// for any `terms`.
// The unit itself is drawn once, by the chart, above its y axis (as ChartFrame and DriveTrace do); `unit`
// here only picks the words. With `empty`, a note sits in the chart's place, the same height, so a period
// page keeps its shape; on a page where a chart has no data, don't render the card at all.
// Server-safe: no hooks, so it wraps server sections and client plots alike.
export function ChartCard({
  title,
  description,
  unit,
  terms = [],
  caption,
  summary,
  empty,
  as: Heading = "h2",
  className,
  children,
}: {
  // "Speed": what is measured, sentence case, no unit.
  title: string;
  // "How fast the car went through the drive, in km/h.": what it shows and how to read it.
  description: ReactNode;
  // Like "kW" or "km/h". Picks the unit's plain words for the caption, when it has any.
  unit?: string;
  // Other glossary terms the chart uses, like "grade" or "regen", explained after the unit.
  terms?: string[];
  // A footnote under the chart: where the data comes from, what a gap means.
  caption?: ReactNode;
  // Tiles or a headline value between the description and the chart.
  summary?: ReactNode;
  // Like "No driving today": shown in place of the chart.
  empty?: ReactNode;
  // h2 when the chart is the section; h3 under a section's own h2.
  as?: "h2" | "h3";
  className?: string;
  children?: ReactNode;
}) {
  const words = unitNotes([unit, ...terms]);
  const footnote =
    caption || words ? (
      <>
        {caption}
        {caption && words ? " " : null}
        {words}
      </>
    ) : null;
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <Heading className={cn("font-medium tracking-heading", Heading === "h2" ? "text-lg" : "text-base")}>{title}</Heading>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {summary}
      {empty ? (
        <EmptyChart>{empty}</EmptyChart>
      ) : (
        <Captioned caption={footnote}>{children}</Captioned>
      )}
      {empty && footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
    </section>
  );
}
