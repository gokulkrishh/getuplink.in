import type { ReactNode } from "react";
import { InfoButton } from "@/components/info-button";
import { Captioned, EmptyChart } from "@/components/stats/bars";
import { cn } from "@/lib/utils";

// Every chart in the app, wrapped the same way (see docs/charts.md): a sentence-case title with an ⓘ beside
// it, one short line on what the chart shows, optional tiles or a headline value, the chart itself, and at
// most one short caption under it. The ⓘ opens a popover with the plain words for `unit` and `terms`
// (lib/unit-words.ts) and any `info` (how a figure is worked out); nothing about units shows inline.
// The unit itself is drawn once, by the chart, above its y axis (as ChartFrame and DriveTrace do). With
// `empty`, a note sits in the chart's place, the same height, so a period page keeps its shape; on a page
// where a chart has no data, don't render the card at all.
// Server-safe: no hooks, so it wraps server sections and client plots alike (InfoButton is its own client
// component).
export function ChartCard({
  title,
  description,
  unit,
  terms = [],
  info,
  caption,
  summary,
  empty,
  as: Heading = "h2",
  className,
  children,
}: {
  // "Speed": what is measured, sentence case, no unit.
  title: string;
  // "Battery lost while parked. Lower is better.": one short sentence on what it shows.
  description: ReactNode;
  // Like "kW" or "Wh/km". Its plain words go in the ⓘ popover, when it has any.
  unit?: string;
  // Other glossary terms the chart or its tiles use, like "grade" or "regen", explained after the unit.
  terms?: string[];
  // Method notes for the ⓘ popover: how a figure is worked out, what a mark or a gap means.
  info?: ReactNode;
  // One short line under the chart, only when needed ("Last 7 days").
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
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Heading className={cn("font-medium tracking-heading", Heading === "h2" ? "text-lg" : "text-base")}>{title}</Heading>
          <InfoButton label={title} terms={[unit, ...terms]}>
            {info}
          </InfoButton>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {summary}
      {empty ? <EmptyChart>{empty}</EmptyChart> : <Captioned caption={caption}>{children}</Captioned>}
      {empty && caption && <p className="text-sm text-muted-foreground">{caption}</p>}
    </section>
  );
}
