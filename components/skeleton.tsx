import type { ReactNode } from "react";
import { Words } from "@/components/stats/charge-supply";
import { Figures } from "@/components/stats/figures";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TABLE_FRAME, TABLE_HEAD_ROW } from "@/lib/table-frame";

// Pieces for the loading screens (the Suspense fallbacks), built from the page's own layout classes so a
// block is as tall as what replaces it and nothing moves when the page arrives. Text is placeholder words
// in a transparent colour on a muted fill: the line takes its real height and shows as a bar. Use words as
// long as a typical real line, since a bar shows the line's length.
const PH = "box-decoration-clone rounded-md bg-muted text-transparent motion-safe:animate-pulse";

// Placeholder text, inline: for use inside a real text class (text-sm, text-lg font-medium, ...).
export function Ph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn(PH, className)}>
      {children}
    </span>
  );
}

// A loading screen's wrapper: announced once.
export function Loading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

// A section's title and the one line under it (ChartCard's and the sections' own heading block). `gap`
// is the space between them: 1 for a chart card, 2 for Places. `note`: a second line (Trips' "Open a trip…").
export function SkHead({ title, description, note, gap = 1, level = "h2" }: { title: string; description?: string; note?: string; gap?: 1 | 2; level?: "h2" | "h3" }) {
  return (
    <div className={gap === 1 ? "space-y-1" : "space-y-2"}>
      <p className={cn("font-medium tracking-heading", level === "h2" ? "text-lg" : "text-base")}>
        <Ph>{title}</Ph>
      </p>
      {description && (
        <p className="text-sm">
          <Ph>{description}</Ph>
        </p>
      )}
      {note && (
        <p className="text-sm">
          <Ph>{note}</Ph>
        </p>
      )}
    </div>
  );
}

// A section: its blocks stacked the way the sections stack theirs (space-y-4, or 6 for the longer ones).
export function SkSection({ gap = 4, className, children }: { gap?: 2 | 3 | 4 | 6 | 8; className?: string; children: ReactNode }) {
  return <div className={cn({ 2: "space-y-2", 3: "space-y-3", 4: "space-y-4", 6: "space-y-6", 8: "space-y-8" }[gap], className)}>{children}</div>;
}

// The tiles (Figures itself, so the grid, columns and heights are the real ones) with placeholder words in
// their place. Give each the value's and the note's usual length; a tile without `note` has none.
export function SkFigures({ tiles, className }: { tiles: { label: string; value: string; note?: string; bar?: boolean; words?: boolean }[]; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className="motion-safe:animate-pulse [&_*]:!text-transparent [&_dd]:self-start [&_dd]:rounded-md [&_dd]:bg-muted [&_dt]:self-start [&_dt]:rounded-md [&_dt]:bg-muted"
    >
      <Figures className={className} figures={tiles.map(({ bar, words, ...t }) => ({ ...t, value: words ? <Words>{t.value}</Words> : t.value, extra: bar ? <div className="h-1 bg-muted" /> : undefined }))} />
    </div>
  );
}

// A chart's panel: Bars' and the line charts' ChartFrame, 160px (h-40) tall.
export function SkChart({ className }: { className?: string }) {
  return <div className={cn("h-40 rounded-lg bg-muted motion-safe:animate-pulse dark:bg-card", className)} />;
}

// Any other filled box (a map, a plot, a heatmap): give it the real one's height.
export function SkBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

// A chart's panel with the line under it (Captioned: space-y-2, a text-sm caption).
export function SkChartCaptioned({ caption, className }: { caption: string; className?: string }) {
  return (
    <div className="space-y-2">
      <SkChart className={className} />
      <p className="text-sm">
        <Ph>{caption}</Ph>
      </p>
    </div>
  );
}

// A line of text, in its real size: `className` is the real line's (text-sm, text-xs, ...).
export function SkLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p aria-hidden="true" className={cn("text-sm", className)}>
      <Ph>{children}</Ph>
    </p>
  );
}

// A big number with its label beside it, wrapping under it on a phone (Charge level's and Parked drain's).
export function SkBigLabel({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <p aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-4xl font-medium tracking-tight">
        <Ph>{value}</Ph>
        <span className="ml-1 text-base font-normal tracking-normal">
          <Ph>{unit}</Ph>
        </span>
      </span>
      <span className="text-base">
        <Ph>{label}</Ph>
      </span>
    </p>
  );
}

// The big number over a chart and the sentence under it (Headline in driving-sections.tsx).
export function SkHeadline({ value, line }: { value: string; line: string }) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-4xl font-medium tracking-tight">
        <Ph>{value}</Ph>
      </p>
      <p className="text-sm">
        <Ph>{line}</Ph>
      </p>
    </div>
  );
}

// A table: the header (text-xs, its band, a rule) and `rows` rows of py-3 text-sm cells, one word per column.
export function SkTable({ head, rows, cell = "py-3", name = "Placeholder", className }: { head: string[]; rows: number; cell?: string; name?: string; className?: string }) {
  return (
    <div className={TABLE_FRAME} aria-hidden="true">
    <table className={cn("w-full min-w-md text-sm", className)}>
      <thead>
        <tr className={`border-b text-left text-xs ${TABLE_HEAD_ROW}`}>
          {head.map((h, k) => (
            <th key={h + k} className={cn("pr-4 font-normal", k > 1 && "text-right")}>
              <Ph>{h}</Ph>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {head.map((h, k) => (
              <td key={h + k} className={cn(cell, "pr-4", k > 1 && "text-right")}>
                <Ph>{k === 0 ? "00" : k === 1 ? name : "Placeholder"}</Ph>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

// The "Show N more" under a list kept to its preview, in the real button.
export function SkShowMore() {
  return (
    <div className="flex justify-end pt-2" aria-hidden="true">
      <Button type="button" variant="ghost" size="xs" tabIndex={-1} className="-mr-2 bg-muted text-transparent motion-safe:animate-pulse">
        Show 8 more
      </Button>
    </div>
  );
}

// The trips list as TripRows draws it: a table of two-line rows, as wide on a phone as the real one.
export function SkTripRows({ rows = 3 }: { rows?: number }) {
  const head = ["#", "When", "Trip", "Distance · time", "Energy · battery"];
  return (
    <>
      <div className={TABLE_FRAME} aria-hidden="true">
        <table className="w-full min-w-[44rem] table-fixed text-sm">
          <colgroup>
            <col className="w-10" />
            <col className="w-44" />
            <col />
            <col className="w-36" />
            <col className="w-36" />
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr className={`border-b text-left text-xs ${TABLE_HEAD_ROW}`}>
              {head.map((h, k) => (
                <th key={h} className={cn("pr-3 font-normal", k > 2 && "text-right")}>
                  <Ph>{h}</Ph>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <td className="py-3 pr-3 text-xs">
                  <Ph>1</Ph>
                </td>
                <td className="py-3 pr-3">
                  <span className="block">
                    <Ph>Yesterday</Ph>
                  </span>
                  <span className="block text-xs">
                    <Ph>8:18 AM to 8:52 AM</Ph>
                  </span>
                </td>
                <td className="py-3 pr-3 font-medium">
                  <Ph>Home to Work</Ph>
                </td>
                <td className="py-3 pr-3 text-right">
                  <span className="block font-mono">
                    <Ph>14.8 km</Ph>
                  </span>
                  <span className="block text-xs">
                    <Ph>34 min</Ph>
                  </span>
                </td>
                <td className="py-3 pr-3 text-right">
                  <span className="block font-mono">
                    <Ph>1.8 kWh</Ph>
                  </span>
                  <span className="block text-xs">
                    <Ph>3% of battery</Ph>
                  </span>
                </td>
                <td className="py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
